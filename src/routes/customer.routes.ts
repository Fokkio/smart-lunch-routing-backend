import { Router } from 'express';
import { CustomerController } from '../controllers/customer.controller';

export const customerRoutes = Router();

customerRoutes.get('/', CustomerController.list);
customerRoutes.get('/nearby', CustomerController.nearby);
customerRoutes.post('/', CustomerController.create);
customerRoutes.put('/:id', CustomerController.update);
customerRoutes.delete('/:id', CustomerController.remove);

