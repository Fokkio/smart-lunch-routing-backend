import { Router } from 'express';
import { getPool, withTransaction } from '../database/mysql.connection';
import {
  type Identity,
  hashPassword,
  login,
  normalizeRiderUsername,
  requireAuth,
  requireOwner,
  requireRider,
  verifyPassword,
} from '../middleware/auth';
import type { RowDataPacket } from 'mysql2/promise';
import { badInput, validateObject } from '../services/input-validation';

export const authRoutes = Router();
authRoutes.post('/login', async (req, res, next) => {
  try {
    const { role, username, password } = req.body ?? {};
    if (
      (role !== 'OWNER' && role !== 'RIDER') ||
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      username.length < 1 ||
      username.length > 100 ||
      password.length < 1 ||
      password.length > 128
    ) {
      res.status(400).json({ message: 'Role, username and password are required' });
      return;
    }
    const legacyRiderId = /^[1-9]\d*$/.test(username) && Number.isSafeInteger(Number(username));
    if (role === 'RIDER' && !normalizeRiderUsername(username) && !legacyRiderId) {
      res.status(400).json({ message: 'Invalid rider username' });
      return;
    }
    res.json(await login(role, username.trim(), password));
  } catch (error) {
    next(error);
  }
});
authRoutes.get('/me', requireAuth, (_req, res) => res.json(res.locals['identity'] as Identity));
authRoutes.get('/owner-account', requireAuth, requireOwner, async (_req, res, next) => {
  try {
    const ownerId = (res.locals['identity'] as Identity).id;
    const [rows] = await getPool().execute<(RowDataPacket & { username: string })[]>(
      "SELECT username FROM admin_users WHERE admin_user_id=? AND role='OWNER' AND is_active=TRUE",
      [ownerId],
    );
    if (!rows[0]) {
      res.status(401).json({ message: 'Session expired or account disabled' });
      return;
    }
    res.json({ username: rows[0].username });
  } catch (error) {
    next(error);
  }
});
authRoutes.put('/owner-account', requireAuth, requireOwner, async (req, res, next) => {
  try {
    const body: unknown = req.body;
    validateObject(body);
    const { username, currentPassword, newPassword } = body;
    if (
      typeof currentPassword !== 'string' ||
      !currentPassword ||
      currentPassword.length > 128 ||
      (username === undefined && newPassword === undefined)
    ) {
      badInput('Current password and an account change are required');
    }
    const normalizedUsername = typeof username === 'string' ? username.trim().toLowerCase() : null;
    if (username !== undefined && (!normalizedUsername || normalizedUsername.length > 100)) {
      badInput('Username must contain 1 to 100 characters');
    }
    if (newPassword !== undefined && typeof newPassword !== 'string')
      badInput('New password must be a string');
    const ownerId = (res.locals['identity'] as Identity).id;
    const changed = await withTransaction(async (conn) => {
      const [rows] = await conn.execute<(RowDataPacket & { password_hash: string })[]>(
        "SELECT password_hash FROM admin_users WHERE admin_user_id=? AND role='OWNER' AND is_active=TRUE FOR UPDATE",
        [ownerId],
      );
      if (
        !rows[0]?.password_hash ||
        !(await verifyPassword(currentPassword, rows[0].password_hash))
      )
        return false;
      const hash = newPassword === undefined ? null : await hashPassword(newPassword);
      await conn.execute(
        'UPDATE admin_users SET username=COALESCE(?,username),password_hash=COALESCE(?,password_hash) WHERE admin_user_id=?',
        [normalizedUsername, hash, ownerId],
      );
      await conn.execute('DELETE FROM auth_sessions WHERE actor_type=? AND actor_id=?', [
        'OWNER',
        ownerId,
      ]);
      return true;
    });
    if (!changed) {
      res.status(401).json({ message: 'Current password is incorrect' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ message: 'Username is already in use' });
      return;
    }
    next(error);
  }
});
authRoutes.post('/logout', requireAuth, async (_req, res, next) => {
  try {
    await getPool().execute('DELETE FROM auth_sessions WHERE token_hash=?', [
      res.locals['tokenHash'],
    ]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
authRoutes.put('/password', requireAuth, requireRider, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      res.status(400).json({ message: 'Current and new passwords are required' });
      return;
    }
    const riderId = (res.locals['identity'] as Identity).id;
    const changed = await withTransaction(async (conn) => {
      const [rows] = await conn.execute<(RowDataPacket & { password_hash: string | null })[]>(
        "SELECT password_hash FROM riders WHERE rider_id=? AND login_enabled=TRUE AND status='ACTIVE' FOR UPDATE",
        [riderId],
      );
      if (
        !rows[0]?.password_hash ||
        !(await verifyPassword(currentPassword, rows[0].password_hash))
      )
        return false;
      const hash = await hashPassword(newPassword);
      await conn.execute('UPDATE riders SET password_hash=? WHERE rider_id=?', [hash, riderId]);
      await conn.execute('DELETE FROM auth_sessions WHERE actor_type=? AND actor_id=?', [
        'RIDER',
        riderId,
      ]);
      return true;
    });
    if (!changed) {
      res.status(401).json({ message: 'Current password is incorrect' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
