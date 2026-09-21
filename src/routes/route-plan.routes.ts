import { Router } from 'express';
import { RoutePlanController } from '../controllers/route-plan.controller';

export const routePlanRoutes = Router();

routePlanRoutes.post('/generate', RoutePlanController.generate);
routePlanRoutes.post('/recalculate', RoutePlanController.recalculate);
routePlanRoutes.get('/', RoutePlanController.list);
routePlanRoutes.get('/:id', RoutePlanController.get);
routePlanRoutes.post('/:id/select', RoutePlanController.select);
