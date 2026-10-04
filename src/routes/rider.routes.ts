import { Router } from 'express';
import { RiderController } from '../controllers/rider.controller';
import { hashPassword } from '../middleware/auth';
import { withTransaction } from '../database/mysql.connection';

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
