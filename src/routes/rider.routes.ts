import { Router } from 'express';
import { RiderController } from '../controllers/rider.controller';

export const riderRoutes = Router();

riderRoutes.get('/', RiderController.list);
riderRoutes.get('/:id', RiderController.get);
riderRoutes.post('/', RiderController.create);
riderRoutes.put('/:id', RiderController.update);
