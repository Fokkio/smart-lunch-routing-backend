import { closePool, withTransaction } from '../src/database/mysql.connection';
import { clearDatabase } from '../src/database/clear-database';

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
