import type { RowDataPacket } from 'mysql2/promise';
import { closePool, getPool } from '../src/database/mysql.connection';

async function main(): Promise<void> {
  const [rows] = await getPool().query<(RowDataPacket & { count: number })[]>('SELECT COUNT(*) AS count FROM deliveries');
  const [references] = await getPool().query<RowDataPacket[]>(
    `SELECT table_name FROM information_schema.key_column_usage
     WHERE referenced_table_schema=DATABASE() AND referenced_table_name='deliveries'`,
  );
  console.log(`deliveries rows=${rows[0]?.count ?? 0}; inbound foreign keys=${references.length}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => closePool());
