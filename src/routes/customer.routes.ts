import { Router } from 'express';
import { CustomerController } from '../controllers/customer.controller';

export const customerRoutes = Router();

customerRoutes.get('/', CustomerController.list);
customerRoutes.get('/:id', CustomerController.get);
customerRoutes.post('/', CustomerController.create);
customerRoutes.put('/:id', CustomerController.update);
customerRoutes.delete('/:id', CustomerController.remove);

// TODO: add GET /api/customers/nearby?lat=&lng=&radiusKm= once
// CustomerModel.searchNearby is implemented against the confirmed schema.
