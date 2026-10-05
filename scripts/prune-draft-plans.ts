import type { RowDataPacket } from 'mysql2/promise';
import { closePool, getPool } from '../src/database/mysql.connection';
import { RoutePlanModel } from '../src/models/route-plan.model';

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
