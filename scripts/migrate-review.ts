import type { RowDataPacket } from 'mysql2/promise';
import { closePool, getPool, withTransaction } from '../src/database/mysql.connection';
import { RoutePlanModel } from '../src/models/route-plan.model';
import { ShopSettingsModel } from '../src/models/shop-settings.model';
import { lockPlanning, snapshotStop } from '../src/models/plan-inputs';

export async function migrateReview(): Promise<void> {
  // Fail before DDL if uniqueness would require changing customer data.
  for (const table of ['customers', 'riders'] as const) {
    const [duplicates] = await getPool().query<RowDataPacket[]>(
      `SELECT 1 FROM ${table} WHERE phone IS NOT NULL GROUP BY phone HAVING COUNT(*)>1 LIMIT 1`,
    );
    if (duplicates.length) throw new Error(`${table} contains duplicate phone numbers; resolve them before migration. No records were deleted.`);
  }
  const [columns] = await getPool().execute<RowDataPacket[]>(
    "SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='route_plans' AND column_name='input_snapshot'",
  );
  if (!columns.length) await getPool().query('ALTER TABLE route_plans ADD COLUMN input_snapshot JSON NULL');
  for (const table of ['customers', 'riders'] as const) {
    const [indexes] = await getPool().execute<RowDataPacket[]>(
      `SELECT index_name FROM information_schema.statistics WHERE table_schema=DATABASE()
       AND table_name=? AND non_unique=0 GROUP BY index_name HAVING COUNT(*)=1 AND MAX(column_name)='phone'`, [table],
    );
    if (!indexes.length) await getPool().query(`ALTER TABLE ${table} ADD UNIQUE KEY uq_${table}_phone (phone)`);
  }
  await withTransaction(async conn => {
    await lockPlanning(conn);
    // Capture the currently displayed legacy data; past values cannot be reconstructed.
    const [plans] = await conn.query<(RowDataPacket & { route_plan_id: number })[]>(
      "SELECT route_plan_id FROM route_plans WHERE status='SELECTED' AND input_snapshot IS NULL",
    );
    const shop = await ShopSettingsModel.get(conn);
    for (const row of plans) {
      const plan = await RoutePlanModel.findFull(row.route_plan_id, conn);
      if (!plan) throw new Error('Legacy plan disappeared during migration');
      await conn.execute('UPDATE route_plans SET input_snapshot=? WHERE route_plan_id=?',
        [JSON.stringify({ shop, stops: plan.jobs.flatMap(job => job.stops.map(snapshotStop)) }), row.route_plan_id]);
    }
    await conn.execute("UPDATE route_plans SET status='REJECTED' WHERE status='GENERATED' AND input_snapshot IS NULL");
  });
  // Apply the usable data snapshot before privileged DDL; reruns still report a missing grant.
  const [foreignKeys] = await getPool().query<(RowDataPacket & { constraint_name: string; delete_rule: string })[]>(
    `SELECT constraint_name,delete_rule FROM information_schema.referential_constraints
     WHERE constraint_schema=DATABASE() AND table_name='delivery_jobs' AND referenced_table_name='riders'`,
  );
  for (const key of foreignKeys) {
    if (key.delete_rule === 'RESTRICT' || key.delete_rule === 'NO ACTION') continue;
    if (!/^[a-zA-Z0-9_]+$/.test(key.constraint_name)) throw new Error('Unexpected foreign key name');
    await getPool().query(`ALTER TABLE delivery_jobs DROP FOREIGN KEY \`${key.constraint_name}\`,
      ADD CONSTRAINT fk_delivery_jobs_rider_restrict FOREIGN KEY(rider_id) REFERENCES riders(rider_id) ON DELETE RESTRICT`);
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/migrate-review.ts')) {
  migrateReview().then(() => console.log('Review migration ready; recalculate legacy drafts'))
    .catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => closePool());
}
