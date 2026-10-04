import { Router } from 'express';
import { RiderController } from '../controllers/rider.controller';

export const riderRoutes = Router();

riderRoutes.get('/', RiderController.list);
riderRoutes.post('/', RiderController.create);
riderRoutes.put('/:id', RiderController.update);
riderRoutes.delete('/:id', RiderController.delete);
