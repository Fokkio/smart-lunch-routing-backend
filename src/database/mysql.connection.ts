import fs from 'node:fs';
import mysql, { type PoolConnection } from 'mysql2/promise';
import { config, databaseConfigError } from '../config/env';

let pool: mysql.Pool | undefined;

export function getPool(): mysql.Pool {
  if (pool) return pool;

  const problem = databaseConfigError();
  if (problem) throw new Error(problem);

  let ssl: mysql.SslOptions | undefined;

  if (config.db.ssl) {
    if (config.db.caPath) {
      ssl = {
        ca: fs.readFileSync(config.db.caPath, 'utf8'),
        rejectUnauthorized: true,
      };
    } else {
      ssl = {
        rejectUnauthorized: true,
      };
    }
  }

  pool = mysql.createPool({
    host: config.db.host!,
    port: config.db.port,
    user: config.db.user!,
    password: config.db.password!,
    database: config.db.database!,
    ssl,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    decimalNumbers: true,
  });

  return pool;
}

export async function testDatabaseConnection(): Promise<void> {
  const c = await getPool().getConnection();

  try {
    await c.query('SELECT 1');
  } finally {
    c.release();
  }
}

export const checkConnection = async (): Promise<boolean> => {
  try {
    await testDatabaseConnection();
    console.log('[db] TiDB connection OK.');
    return true;
  } catch (error) {
    console.warn(`[db] TiDB unavailable: ${(error as Error).message}`);
    return false;
  }
};

export async function withTransaction<T>(
  work: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const c = await getPool().getConnection();

  try {
    await c.beginTransaction();
    const result = await work(c);
    await c.commit();
    return result;
  } catch (error) {
    await c.rollback();
    throw error;
  } finally {
    c.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
