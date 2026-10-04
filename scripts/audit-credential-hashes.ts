import type { RowDataPacket } from 'mysql2/promise';
import { closePool, getPool } from '../src/database/mysql.connection';

async function count(table: 'admin_users' | 'riders'): Promise<void> {
  const [rows] = await getPool().query<(RowDataPacket & { total: number; bcrypt10: number; other: number })[]>(
    `SELECT COUNT(password_hash) AS total,
      COALESCE(SUM(LEFT(password_hash,7) IN ('$2a$10$','$2b$10$','$2y$10$')),0) AS bcrypt10,
      COALESCE(SUM(password_hash IS NOT NULL AND LEFT(password_hash,7) NOT IN ('$2a$10$','$2b$10$','$2y$10$')),0) AS other
     FROM ${table}`,
  );
  const row = rows[0]!;
  console.log(`${table}: configured=${row.total}, bcrypt_cost_10=${row.bcrypt10}, other=${row.other}`);
}
async function main(): Promise<void> { await count('admin_users'); await count('riders'); }
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => closePool());
