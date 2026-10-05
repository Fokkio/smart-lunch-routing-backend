import type { RowDataPacket } from 'mysql2/promise';
import { closePool, getPool } from '../src/database/mysql.connection';

async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows] = await getPool().execute<RowDataPacket[]>(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1`, [table, column],
  );
  return rows.length > 0;
}

async function indexExists(table: string, index: string): Promise<boolean> {
  const [rows] = await getPool().execute<RowDataPacket[]>(
    'SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=? LIMIT 1',
    [table, index],
  );
  return rows.length > 0;
}

async function main(): Promise<void> {
  await getPool().query(`CREATE TABLE IF NOT EXISTS admin_users (
    admin_user_id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(150) NULL, password_hash VARCHAR(255) NOT NULL,
    role ENUM('OWNER','ADMIN') NOT NULL DEFAULT 'OWNER', is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  if (!await columnExists('riders', 'password_hash')) {
    await getPool().query('ALTER TABLE riders ADD COLUMN password_hash VARCHAR(255) NULL');
  }
  if (!await columnExists('riders', 'username')) {
    await getPool().query('ALTER TABLE riders ADD COLUMN username VARCHAR(100) NULL');
  }
  await getPool().query("UPDATE riders SET username=CONCAT('rider_',rider_id) WHERE username IS NULL");
  if (!await indexExists('riders', 'uq_riders_username')) {
    await getPool().query('ALTER TABLE riders ADD UNIQUE KEY uq_riders_username (username)');
  }
  if (!await columnExists('riders', 'login_enabled')) {
    await getPool().query('ALTER TABLE riders ADD COLUMN login_enabled BOOLEAN NOT NULL DEFAULT TRUE');
  }
  if (!await columnExists('riders', 'status')) {
    await getPool().query("ALTER TABLE riders ADD COLUMN status ENUM('ACTIVE','INACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE'");
  }
  await getPool().query(`CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash CHAR(64) PRIMARY KEY, actor_type ENUM('OWNER','RIDER') NOT NULL,
    actor_id INT NOT NULL, expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_auth_sessions_expiry (expires_at)
  ) ENGINE=InnoDB`);
  await getPool().query(`CREATE TABLE IF NOT EXISTS auth_login_attempts (
    subject_hash CHAR(64) PRIMARY KEY, failed_count INT NOT NULL DEFAULT 0,
    window_started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    blocked_until DATETIME NULL
  ) ENGINE=InnoDB`);
  console.log('Account schema ready');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => closePool());
