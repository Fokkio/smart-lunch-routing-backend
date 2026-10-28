// ไฟล์นี้: ลบตาราง deliveries เก่าทิ้งเมื่อตารางว่างและไม่มีตารางอื่นอ้างถึงแล้ว
// รันด้วย: npx tsx scripts/remove-legacy-deliveries.ts
import type { RowDataPacket } from 'mysql2/promise';
import { closePool, getPool } from '../src/database/mysql.connection';

// main(): ถ้าตาราง deliveries เก่าว่างและไม่มี foreign key อ้างถึง ให้ลบตารางทิ้ง ถ้าไม่ว่างจะปฏิเสธ
async function main(): Promise<void> {
  const [tables] = await getPool().query<RowDataPacket[]>(
    `SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='deliveries'`,
  );
  if (!tables.length) { console.log('Legacy deliveries table already absent'); return; }
  const [rows] = await getPool().query<(RowDataPacket & { count: number })[]>('SELECT COUNT(*) AS count FROM deliveries');
  const [references] = await getPool().query<RowDataPacket[]>(
    `SELECT 1 FROM information_schema.key_column_usage
     WHERE referenced_table_schema=DATABASE() AND referenced_table_name='deliveries'`,
  );
  if (Number(rows[0]?.count ?? 0) !== 0 || references.length) throw new Error('Refusing to drop deliveries: table has rows or inbound foreign keys');
  await getPool().query('DROP TABLE deliveries');
  console.log('Removed empty legacy deliveries table');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => closePool());
