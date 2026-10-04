import { closePool, getPool } from '../src/database/mysql.connection';

async function main(): Promise<void> {
  if (process.env['DB_CLEAR_CONFIRM'] !== 'DELETE_ALL_DATA') {
    throw new Error('Refusing to clear the database without DB_CLEAR_CONFIRM=DELETE_ALL_DATA');
  }
  const pool = getPool();
  console.log('[clear-db] Disabling foreign key checks...');
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');

  const tables = [
    'delivery_job_orders',
    'delivery_jobs',
    'deliveries',
    'route_plans',
    'orders',
    'riders',
    'customers',
    'admin_users',
  ];

  for (const table of tables) {
    console.log(`[clear-db] Deleting all rows from ${table}...`);
    await pool.query(`DELETE FROM ${table}`);
    try {
      await pool.query(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
    } catch {
      // Ignored for engines/tables that do not support resetting auto increment
    }
  }

  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('[clear-db] Foreign key checks re-enabled.');
  console.log('[clear-db] All specified tables cleared successfully.');
}

main()
  .catch((err) => {
    console.error('[clear-db] Failed:', err);
    process.exitCode = 1;
  })
  .finally(closePool);
