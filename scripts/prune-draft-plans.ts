// ไฟล์นี้: ลบแผนร่างเก่าที่ไม่ได้ใช้แล้ว (ค่าเริ่มต้นคือเก่ากว่า 30 วัน)
// รันด้วย: npm run db:prune-drafts (ใส่ --apply เพื่อลบจริง ไม่ใส่คือดูตัวอย่างก่อน)
import type { RowDataPacket } from 'mysql2/promise';
import { closePool, getPool } from '../src/database/mysql.connection';
import { RoutePlanModel } from '../src/models/route-plan.model';

// main(): หาแผนร่าง GENERATED/REJECTED ที่เก่ากว่า --days (ค่าเริ่มต้น 30 วัน) ถ้าไม่มี --apply จะแค่แสดงตัวอย่าง
async function main(): Promise<void> {
  const days = Number(process.argv.find(arg => arg.startsWith('--days='))?.split('=')[1] ?? '30');
  if (!Number.isSafeInteger(days) || days < 1) throw new Error('--days must be a positive integer');
  const [rows] = await getPool().execute<(RowDataPacket & { route_plan_id: number })[]>(
    `SELECT route_plan_id FROM route_plans
     WHERE status IN ('GENERATED','REJECTED') AND created_at<DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
     ORDER BY route_plan_id`, [days],
  );
  console.log(`${rows.length} draft plans older than ${days} days`);
  if (!process.argv.includes('--apply')) { console.log('Dry run only. Add --apply to delete these drafts.'); return; }
  let deleted = 0;
  for (const row of rows) if (await RoutePlanModel.deleteById(row.route_plan_id, true)) deleted++;
  console.log(`${deleted} draft plans deleted`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => closePool());
