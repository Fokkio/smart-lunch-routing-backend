import { Router } from 'express';
import { RoutePlanModel } from '../models/route-plan.model';
import type { Identity } from '../middleware/auth';
import { ShopSettingsModel } from '../models/shop-settings.model';
import { validDate } from '../services/input-validation';

export const riderJobRoutes = Router();

riderJobRoutes.get('/', async (req, res, next) => {
  try {
    const date = req.query['date'];
    if (!validDate(date)) { res.status(400).json({ message: 'date must be YYYY-MM-DD' }); return; }
    const [jobs, settings] = await Promise.all([
      RoutePlanModel.findRiderJobs((res.locals['identity'] as Identity).id, date),
      ShopSettingsModel.get(),
    ]);
    res.json(jobs.map(item => ({ ...item, shop: {
      latitude: Number(item.shop?.latitude ?? settings.latitude), longitude: Number(item.shop?.longitude ?? settings.longitude),
      deliveryDeadline: (item.deliveryDeadline ?? item.shop?.deliveryDeadline ?? settings.deliveryDeadline).slice(0, 5),
    } })));
  } catch (error) { next(error); }
});

for (const action of ['acknowledge','start'] as const) {
  riderJobRoutes.post(`/:jobId/${action}`,async(req,res,next)=>{
    try{
      const jobId=Number(req.params['jobId']);
      if(!Number.isSafeInteger(jobId)||jobId<1){res.status(400).json({message:'Invalid job ID'});return;}
      const changed=await RoutePlanModel.acknowledgeJob(jobId,(res.locals['identity'] as Identity).id,action==='start');
      if(!changed){res.status(404).json({message:'Job not found'});return;}
      res.json({[action==='start'?'started':'acknowledged']:true});
    }catch(error){next(error);}
  });
}

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
