import {closePool,getPool,withTransaction} from '../src/database/mysql.connection';
import {lockPlanning} from '../src/models/plan-inputs';
import type {RowDataPacket} from 'mysql2/promise';

export async function migrateDispatch():Promise<void>{
  for(const [table,column,definition] of [
    ['delivery_jobs','acknowledged_at','DATETIME NULL'],
    ['delivery_jobs','assigned_at','DATETIME NULL'],
    ['shop_settings','stop_service_minutes','INT NOT NULL DEFAULT 0'],
  ]){
    const [rows]=await getPool().execute<RowDataPacket[]>('SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?',[table,column]);
    if(!rows.length)await getPool().query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  await withTransaction(async conn=>{
    await lockPlanning(conn);
    // Old drafts predate acknowledgement and per-stop timing; selected history stays intact.
    await conn.execute("UPDATE route_plans SET status='REJECTED' WHERE status='GENERATED' AND (input_snapshot IS NULL OR JSON_EXTRACT(input_snapshot,'$.shop.stopServiceMinutes') IS NULL)");
  });
}
if(process.argv[1]?.replace(/\\/g,'/').endsWith('/migrate-dispatch.ts'))migrateDispatch().then(()=>console.log('Dispatch migration ready'))
 .catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>closePool());
