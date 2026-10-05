import { Router } from 'express';
import { RiderController } from '../controllers/rider.controller';
import { hashPassword, normalizeRiderUsername } from '../middleware/auth';
import { withTransaction } from '../database/mysql.connection';
import type { RowDataPacket } from 'mysql2/promise';

export const riderRoutes = Router();

riderRoutes.get('/', RiderController.list);
riderRoutes.post('/', RiderController.create);
riderRoutes.put('/:id', RiderController.update);
riderRoutes.delete('/:id', RiderController.delete);
riderRoutes.put('/:id/password', async (req, res, next) => {
  try {
    const id = Number(req.params['id']);
    if (!Number.isSafeInteger(id) || id < 1 || typeof req.body?.password !== 'string') {
      res.status(400).json({ message: 'Valid rider ID and password are required' }); return;
    }
    const hash = await hashPassword(req.body.password);
    const found = await withTransaction(async conn => {
      const [result] = await conn.execute<import('mysql2/promise').ResultSetHeader>(
        'UPDATE riders SET password_hash=?, login_enabled=TRUE WHERE rider_id=?', [hash, id],
      );
      if (!result.affectedRows) return false;
      await conn.execute('DELETE FROM auth_sessions WHERE actor_type=? AND actor_id=?', ['RIDER', id]);
      return true;
    });
    if (!found) { res.status(404).json({ message: 'Rider not found' }); return; }
    res.status(204).end();
  } catch (error) { next(error); }
});

riderRoutes.put('/:id/account', async (req, res, next) => {
  try {
    const id = Number(req.params['id']);
    const username = normalizeRiderUsername(req.body?.username);
    const password = req.body?.password;
    if (!Number.isSafeInteger(id) || id < 1 || !username ||
        (password !== undefined && typeof password !== 'string') ||
        (/^rider_\d+$/.test(username) && username !== `rider_${id}`)) {
      res.status(400).json({ message: 'Valid rider ID and username are required' }); return;
    }
    const hash = password === undefined ? null : await hashPassword(password);
    const result = await withTransaction(async conn => {
      const [rows] = await conn.execute<(RowDataPacket & { password_hash: string | null })[]>(
        'SELECT password_hash FROM riders WHERE rider_id=? FOR UPDATE', [id],
      );
      if (!rows.length) return 'missing';
      if (!hash && !rows[0]?.password_hash) return 'password-required';
      await conn.execute('UPDATE riders SET username=?,password_hash=COALESCE(?,password_hash),login_enabled=TRUE WHERE rider_id=?',
        [username, hash, id]);
      await conn.execute('DELETE FROM auth_sessions WHERE actor_type=? AND actor_id=?', ['RIDER', id]);
      return 'ok';
    });
    if (result === 'missing') { res.status(404).json({ message: 'Rider not found' }); return; }
    if (result === 'password-required') { res.status(400).json({ message: 'Set an initial password for this rider' }); return; }
    res.status(204).end();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ message: 'Username is already in use' }); return;
    }
    next(error);
  }
});
