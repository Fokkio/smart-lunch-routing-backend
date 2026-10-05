import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

// Child-first deletion keeps FK checks enabled; caller owns the transaction.
const tables = ['auth_sessions', 'auth_login_attempts', 'delivery_job_orders', 'delivery_jobs', 'route_plans', 'orders', 'riders', 'customers', 'admin_users'] as const;

export async function clearDatabase(connection: PoolConnection): Promise<void> {
  const [rows] = await connection.query<RowDataPacket[]>('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
  const present = new Set(rows.map(row => String(row.TABLE_NAME)));
  const missing = tables.filter(table => !present.has(table));
  if (missing.length) throw new Error(`Refusing partial clear: missing tables ${missing.join(', ')}`);
  for (const table of tables) await connection.query(`DELETE FROM ${table}`);
}
