import { Router } from 'express';
import { getPool, withTransaction } from '../database/mysql.connection';
import { type Identity, hashPassword, login, normalizeRiderUsername, requireAuth, requireRider, verifyPassword } from '../middleware/auth';
import type { RowDataPacket } from 'mysql2/promise';

export const authRoutes = Router();
authRoutes.post('/login', async (req, res, next) => {
  try {
    const { role, username, password } = req.body ?? {};
    if ((role !== 'OWNER' && role !== 'RIDER') || typeof username !== 'string' || typeof password !== 'string' ||
        username.length < 1 || username.length > 100 || password.length < 1 || password.length > 128) {
      res.status(400).json({ message: 'Role, username and password are required' }); return;
    }
    const legacyRiderId = /^[1-9]\d*$/.test(username) && Number.isSafeInteger(Number(username));
    if (role === 'RIDER' && !normalizeRiderUsername(username) && !legacyRiderId) {
      res.status(400).json({ message: 'Invalid rider username' }); return;
    }
    res.json(await login(role, username.trim(), password));
  } catch (error) { next(error); }
});
authRoutes.get('/me', requireAuth, (_req, res) => res.json(res.locals['identity'] as Identity));
authRoutes.post('/logout', requireAuth, async (_req, res, next) => {
  try {
    await getPool().execute('DELETE FROM auth_sessions WHERE token_hash=?', [res.locals['tokenHash']]);
    res.status(204).end();
  } catch (error) { next(error); }
});
authRoutes.put('/password', requireAuth, requireRider, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      res.status(400).json({ message: 'Current and new passwords are required' }); return;
    }
    const riderId = (res.locals['identity'] as Identity).id;
    const changed = await withTransaction(async conn => {
      const [rows] = await conn.execute<(RowDataPacket & { password_hash: string | null })[]>(
      "SELECT password_hash FROM riders WHERE rider_id=? AND login_enabled=TRUE AND status='ACTIVE' FOR UPDATE", [riderId],
      );
      if (!rows[0]?.password_hash || !await verifyPassword(currentPassword, rows[0].password_hash)) return false;
      const hash = await hashPassword(newPassword);
      await conn.execute('UPDATE riders SET password_hash=? WHERE rider_id=?', [hash, riderId]);
      await conn.execute('DELETE FROM auth_sessions WHERE actor_type=? AND actor_id=?', ['RIDER', riderId]);
      return true;
    });
    if (!changed) { res.status(401).json({ message: 'Current password is incorrect' }); return; }
    res.status(204).end();
  } catch (error) { next(error); }
});
