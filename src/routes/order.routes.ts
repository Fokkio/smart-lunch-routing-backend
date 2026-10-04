import { Router } from 'express';
import { OrderController } from '../controllers/order.controller';

export const orderRoutes = Router();

orderRoutes.get('/', OrderController.list);
orderRoutes.get('/nearby', OrderController.nearby);
orderRoutes.post('/simulate', OrderController.simulate);
orderRoutes.delete('/simulated', OrderController.clearSimulated);
orderRoutes.post('/', OrderController.create);
orderRoutes.put('/:id', OrderController.update);
orderRoutes.delete('/:id', OrderController.remove);
