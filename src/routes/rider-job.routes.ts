import { Router } from 'express';
import { RoutePlanModel } from '../models/route-plan.model';
import type { Identity } from '../middleware/auth';
import { ShopSettingsModel } from '../models/shop-settings.model';

export const riderJobRoutes = Router();
const DATE = /^\d{4}-\d{2}-\d{2}$/;

riderJobRoutes.get('/', async (req, res, next) => {
  try {
    const date = req.query['date'];
    if (typeof date !== 'string' || !DATE.test(date)) { res.status(400).json({ message: 'date must be YYYY-MM-DD' }); return; }
    const [jobs, settings] = await Promise.all([
      RoutePlanModel.findRiderJobs((res.locals['identity'] as Identity).id, date),
      ShopSettingsModel.get(),
    ]);
    res.json(jobs.map(item => ({ ...item, shop: {
      latitude: Number(settings.latitude), longitude: Number(settings.longitude),
      deliveryDeadline: settings.deliveryDeadline.slice(0, 5),
    } })));
  } catch (error) { next(error); }
});

riderJobRoutes.post('/:jobId/stops/:orderId/deliver', async (req, res, next) => {
  try {
    const jobId = Number(req.params['jobId']);
    const orderId = Number(req.params['orderId']);
    if (![jobId, orderId].every(id => Number.isSafeInteger(id) && id > 0)) {
      res.status(400).json({ message: 'Invalid job or order ID' }); return;
    }
    const riderId = (res.locals['identity'] as Identity).id;
    const planId = await RoutePlanModel.findSelectedRiderJobPlan(riderId, jobId);
    if (!planId) { res.status(404).json({ message: 'Job stop not found' }); return; }
    const delivered = await RoutePlanModel.deliverStop(planId, jobId, orderId, riderId);
    if (!delivered) { res.status(404).json({ message: 'Job stop not found' }); return; }
    res.json({ delivered: true });
  } catch (error) { next(error); }
});
