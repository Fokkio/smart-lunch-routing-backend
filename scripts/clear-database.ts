// ไฟล์นี้: ลบข้อมูลทั้งหมดในฐานข้อมูล (อันตราย ต้องยืนยันก่อนรัน)
// รันด้วย: npm run db:clear โดยต้องตั้ง DB_CLEAR_CONFIRM=DELETE_ALL_DATA
import { closePool, withTransaction } from '../src/database/mysql.connection';
import { clearDatabase } from '../src/database/clear-database';

// main(): ถ้า DB_CLEAR_CONFIRM ไม่ใช่ DELETE_ALL_DATA จะปฏิเสธไม่ลบ แล้วลบข้อมูลทั้งหมดใน transaction
async function main(): Promise<void> {
  if (process.env['DB_CLEAR_CONFIRM'] !== 'DELETE_ALL_DATA') {
    throw new Error('Refusing to clear the database without DB_CLEAR_CONFIRM=DELETE_ALL_DATA');
  }
  await withTransaction(connection => clearDatabase(connection));
  console.log('[clear-db] Data cleared; auto-increment values were preserved.');
}

main()
  .catch((err) => {
    console.error('[clear-db] Failed:', err);
    process.exitCode = 1;
  })
  .finally(closePool);
