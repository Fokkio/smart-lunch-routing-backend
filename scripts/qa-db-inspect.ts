import { getPool, closePool } from '../src/database/mysql.connection';

async function main() { try {
  const db = getPool();
  await db.query('SELECT 1');
  const [columns] = await db.query(`SELECT table_name,column_name,column_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='delivery_jobs' AND column_name IN ('status','rider_id')`);
  console.log(JSON.stringify(columns));
  const [counts] = await db.query('SELECT (SELECT COUNT(*) FROM orders) orders_count,(SELECT COUNT(*) FROM customers) customers_count,(SELECT COUNT(*) FROM riders) riders_count');
  console.log(JSON.stringify(counts));
  const [states]=await db.query('SELECT status,COUNT(*) total FROM orders GROUP BY status');
  console.log(JSON.stringify(states));
  const [active]=await db.query("SELECT (SELECT COUNT(*) FROM admin_users WHERE LEFT(username,3)='qa_' AND is_active=TRUE) active_qa_owners,(SELECT COUNT(*) FROM riders WHERE LEFT(rider_name,6)='QA qa_' AND (is_available=TRUE OR login_enabled=TRUE)) active_qa_riders");
  console.log(JSON.stringify(active));
  const [plans]=await db.query('SELECT status,COUNT(*) total FROM route_plans GROUP BY status');
  console.log(JSON.stringify(plans));
} finally { await closePool(); } }
void main().catch(() => { console.error('Database inspection failed'); process.exitCode = 1; });
