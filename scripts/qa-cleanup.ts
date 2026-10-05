import assert from 'node:assert/strict';
import type { RowDataPacket } from 'mysql2/promise';
import {closePool,withTransaction} from '../src/database/mysql.connection';
import {lockPlanning} from '../src/models/plan-inputs';

/** Retain QA evidence; cancel unfinished QA work and disable only explicitly named test accounts. */
export async function cleanupQaRun(run:string):Promise<void> {
  assert(/^qa_[a-z0-9]+_[a-f0-9]{6}$/.test(run),'An exact QA run ID is required');
  const prefix=`QA ${run}_`;
  await withTransaction(async conn=>{
    await lockPlanning(conn);
    const [plans]=await conn.execute<RowDataPacket[]>(`SELECT DISTINCT rp.route_plan_id,rp.status FROM route_plans rp
      JOIN delivery_jobs dj ON dj.route_plan_id=rp.route_plan_id JOIN delivery_job_orders djo ON djo.delivery_job_id=dj.delivery_job_id
      JOIN orders o ON o.order_id=djo.order_id JOIN customers c ON c.customer_id=o.customer_id WHERE LEFT(c.name,?)=?`,[prefix.length,prefix]);
    for(const plan of plans) {
      const [stops]=await conn.execute<RowDataPacket[]>(`SELECT c.name,o.status FROM delivery_jobs dj
        JOIN delivery_job_orders djo ON djo.delivery_job_id=dj.delivery_job_id JOIN orders o ON o.order_id=djo.order_id
        JOIN customers c ON c.customer_id=o.customer_id WHERE dj.route_plan_id=?`,[plan.route_plan_id]);
      assert(stops.length && stops.every(row=>String(row.name).startsWith(prefix)),'Refusing to change a plan containing non-QA data');
      if(plan.status==='GENERATED' || (plan.status==='SELECTED' && stops.some(row=>row.status!=='DELIVERED'))) {
        await conn.execute("UPDATE route_plans SET status='REJECTED' WHERE route_plan_id=?",[plan.route_plan_id]);
        await conn.execute('UPDATE delivery_jobs SET rider_id=NULL WHERE route_plan_id=?',[plan.route_plan_id]);
      }
    }
    await conn.execute(`UPDATE orders o JOIN customers c ON c.customer_id=o.customer_id SET o.status='CANCELLED'
      WHERE LEFT(c.name,?)=? AND o.status IN ('PENDING','PLANNED','DELIVERING')`,[prefix.length,prefix]);
    await conn.execute('UPDATE riders SET is_available=FALSE,login_enabled=FALSE WHERE LEFT(rider_name,?)=?',[prefix.length,prefix]);
    await conn.execute("DELETE s FROM auth_sessions s JOIN riders r ON s.actor_type='RIDER' AND s.actor_id=r.rider_id WHERE LEFT(r.rider_name,?)=?",[prefix.length,prefix]);
    await conn.execute('UPDATE admin_users SET is_active=FALSE WHERE username=?',[run]);
    await conn.execute("DELETE s FROM auth_sessions s JOIN admin_users a ON s.actor_type='OWNER' AND s.actor_id=a.admin_user_id WHERE a.username=?",[run]);
  });
  console.log(`QA cleanup complete: ${run}; evidence retained; no non-QA records changed`);
}
if(process.argv[1]?.replace(/\\/g,'/').endsWith('/qa-cleanup.ts')) (async()=>{
  assert(process.argv.length>2,'Supply exact QA run IDs');
  for(const run of process.argv.slice(2)) await cleanupQaRun(run);
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>closePool());
