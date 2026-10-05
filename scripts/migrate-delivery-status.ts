import type { RowDataPacket } from 'mysql2/promise';
import { closePool, getPool } from '../src/database/mysql.connection';

/** Add current statuses without removing legacy enum values or rewriting delivery history. */
export async function migrateDeliveryStatus():Promise<void> {
  const [rows]=await getPool().execute<RowDataPacket[]>(`SELECT column_type AS statusType,column_default AS defaultValue,is_nullable AS nullable
    FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='delivery_jobs' AND column_name='status'`);
  const row=rows[0];
  if (!row || typeof row.statusType!=='string' || !/^enum\('[A-Z_]+'(?:,'[A-Z_]+')*\)$/i.test(row.statusType)) throw new Error('Unexpected delivery_jobs.status schema; inspect it before migrating');
  const missing=['WAITING','COMPLETED'].filter(status=>!row.statusType.includes(`'${status}'`));
  if (!missing.length) return;
  if (typeof row.defaultValue!=='string' || !/^[A-Z_]+$/.test(row.defaultValue)) throw new Error('Unexpected delivery job default; inspect it before migrating');
  const expanded=`${row.statusType.slice(0,-1)},${missing.map(status=>`'${status}'`).join(',')})`;
  await getPool().query(`ALTER TABLE delivery_jobs MODIFY COLUMN status ${expanded} ${row.nullable==='YES'?'NULL':'NOT NULL'} DEFAULT '${row.defaultValue}'`);
}
if(process.argv[1]?.replace(/\\/g,'/').endsWith('/migrate-delivery-status.ts')) migrateDeliveryStatus()
  .then(()=>console.log('Delivery job status schema ready; legacy values preserved'))
  .catch(()=>{console.error('Delivery job status migration failed; inspect schema before retrying');process.exitCode=1;}).finally(()=>closePool());
