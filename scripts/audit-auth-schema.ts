// ไฟล์นี้: ตรวจสอบคอลัมน์ของตารางเกี่ยวกับการเข้าสู่ระบบในฐานข้อมูลจริง
// รันด้วย: npx tsx scripts/audit-auth-schema.ts
import { closePool, getPool } from '../src/database/mysql.connection';

// main(): ดึงชื่อตารางกับคอลัมน์ของตาราง auth จาก information_schema แล้วพิมพ์ออกมา
async function main(): Promise<void> {
  const [rows] = await getPool().query<import('mysql2/promise').RowDataPacket[]>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name IN ('admin_users','riders','auth_sessions','auth_login_attempts','deliveries')
     ORDER BY table_name,column_name`,
  );
  console.log(rows.map(row => `${row.table_name}.${row.column_name}`).join('\n'));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => closePool());
