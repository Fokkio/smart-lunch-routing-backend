// ไฟล์นี้: สร้างและดูแล connection pool ไป TiDB/MySQL รวมถึง transaction และการปิด pool
import fs from 'node:fs';
import mysql, { type PoolConnection } from 'mysql2/promise';
import { config, databaseConfigError } from '../config/env';

let pool: mysql.Pool | undefined;

// สร้าง connection pool ครั้งเดียวแล้วคืน pool เดิมทุกครั้ง: ตรวจ config ก่อน ถ้าเปิด SSL ให้ใส่ CA และบังคับตรวจใบรับรอง
export function getPool(): mysql.Pool {
  if (pool) return pool;

  const problem = databaseConfigError();
  if (problem) throw new Error(problem);

  let ssl: mysql.SslOptions | undefined;

  if (config.db.ssl) {
    if (config.db.ca) {
      ssl = {
        ca: config.db.ca,
        rejectUnauthorized: true,
      };
    } else if (config.db.caPath) {
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
    connectionLimit: config.db.connectionLimit,
    queueLimit: 0,
    decimalNumbers: true,
  });

  return pool;
}

// ทดลองยืม connection จาก pool แล้วรัน SELECT 1 เพื่อพิสูจน์ว่าเชื่อมฐานข้อมูลได้
export async function testDatabaseConnection(): Promise<void> {
  const c = await getPool().getConnection();

  try {
    await c.query('SELECT 1');
  } finally {
    c.release();
  }
}

// ทดลองเชื่อมฐานข้อมูล: สำเร็จพิมพ์ log ว่า OK และคืน true ไม่สำเร็จพิมพ์เตือนและคืน false
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

// รันงานที่ส่งมาใน transaction เดียว: สำเร็จ commit ไม่สำเร็จ rollback แล้วคืน connection กลับ pool เสมอ
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

// ปิด connection pool ทั้งหมด (ใช้ตอนปิด server)
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
