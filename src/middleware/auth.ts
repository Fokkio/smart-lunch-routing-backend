import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/mysql.connection';

export type Identity = { type: 'OWNER' | 'RIDER'; id: number; name: string };
type LoginRow = RowDataPacket & { id: number; name: string; password_hash: string; enabled: number };
type SessionRow = RowDataPacket & { actor_type: Identity['type']; actor_id: number; name: string };
type AttemptRow = RowDataPacket & { failed_count: number; blocked: number; stale: number };

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw Object.assign(new Error('Password must be at least 12 characters and at most 72 UTF-8 bytes'), { statusCode: 400 });
  }
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (Buffer.byteLength(password, 'utf8') > 72 || !/^\$2[aby]\$10\$/.test(stored)) return false;
  return bcrypt.compare(password, stored);
}

function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }

export async function login(type: Identity['type'], username: string, password: string): Promise<{ token: string; user: Identity }> {
  await getPool().query('DELETE FROM auth_sessions WHERE expires_at<UTC_TIMESTAMP()');
  await getPool().query('DELETE FROM auth_login_attempts WHERE window_started_at<DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)');
  const subject = tokenHash(`${type}:${username.toLowerCase()}`);
  await getPool().execute('INSERT IGNORE INTO auth_login_attempts(subject_hash) VALUES(?)', [subject]);
  return withTransaction(async conn => {
  const [attempts] = await conn.execute<AttemptRow[]>(
    `SELECT failed_count, blocked_until>UTC_TIMESTAMP() AS blocked,
      window_started_at<DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE) AS stale
     FROM auth_login_attempts WHERE subject_hash=? FOR UPDATE`, [subject],
  );
  const attempt = attempts[0];
  if (attempt?.blocked) throw Object.assign(new Error('Too many login attempts; try again later'), { statusCode: 429 });
  const sql = type === 'OWNER'
    ? "SELECT admin_user_id AS id, COALESCE(display_name, username) AS name, password_hash, is_active AS enabled FROM admin_users WHERE username=? AND role='OWNER'"
    : "SELECT rider_id AS id, rider_name AS name, password_hash, (login_enabled AND status='ACTIVE') AS enabled FROM riders WHERE rider_id=?";
  const [rows] = await conn.execute<LoginRow[]>(sql, [username]);
  const row = rows[0];
  if (!row?.password_hash || !row.enabled || !await verifyPassword(password, row.password_hash)) {
    const failures = (attempt?.stale ? 0 : Number(attempt?.failed_count ?? 0)) + 1;
    await conn.execute(
      `UPDATE auth_login_attempts SET failed_count=?,
       window_started_at=IF(?,UTC_TIMESTAMP(),window_started_at),
       blocked_until=IF(? >= 5,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE),NULL)
       WHERE subject_hash=?`, [failures, attempt?.stale ? 1 : 0, failures, subject],
    );
    // Commit the failed attempt before returning 401.
    return { failed: true as const };
  }
  const token = randomBytes(32).toString('base64url');
  await conn.execute(
    'INSERT INTO auth_sessions(token_hash,actor_type,actor_id,expires_at) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 12 HOUR))',
    [tokenHash(token), type, row.id],
  );
  await conn.execute('DELETE FROM auth_login_attempts WHERE subject_hash=?', [subject]);
  return { failed: false as const, token, user: { type, id: row.id, name: row.name } };
  }).then(result => {
    if (result.failed) throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
    return { token: result.token, user: result.user };
  });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header('Authorization') ?? '';
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header);
    if (!match) { res.status(401).json({ message: 'Login required' }); return; }
    const [rows] = await getPool().execute<SessionRow[]>(
      `SELECT s.actor_type, s.actor_id,
        CASE WHEN s.actor_type='OWNER' THEN COALESCE(a.display_name,a.username) ELSE r.rider_name END AS name
       FROM auth_sessions s
       LEFT JOIN admin_users a ON s.actor_type='OWNER' AND a.admin_user_id=s.actor_id AND a.is_active=TRUE AND a.role='OWNER'
       LEFT JOIN riders r ON s.actor_type='RIDER' AND r.rider_id=s.actor_id AND r.login_enabled=TRUE AND r.status='ACTIVE'
       WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP()`, [tokenHash(match[1]!)],
    );
    const row = rows[0];
    if (!row?.name) { res.status(401).json({ message: 'Session expired or account disabled' }); return; }
    res.locals['identity'] = { type: row.actor_type, id: row.actor_id, name: row.name } satisfies Identity;
    res.locals['tokenHash'] = tokenHash(match[1]!);
    next();
  } catch (error) { next(error); }
}

export function requireOwner(_req: Request, res: Response, next: NextFunction): void {
  if ((res.locals['identity'] as Identity | undefined)?.type !== 'OWNER') { res.status(403).json({ message: 'Owner access required' }); return; }
  next();
}

export function requireRider(_req: Request, res: Response, next: NextFunction): void {
  if ((res.locals['identity'] as Identity | undefined)?.type !== 'RIDER') { res.status(403).json({ message: 'Rider access required' }); return; }
  next();
}
