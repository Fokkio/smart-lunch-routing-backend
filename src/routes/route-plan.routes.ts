// ไฟล์นี้: ผูก path ของแผนจัดส่งเข้ากับ RoutePlanController
import { Router } from 'express';
import { RoutePlanController } from '../controllers/route-plan.controller';

export const routePlanRoutes = Router();

// สร้างแผนจัดส่งใหม่
routePlanRoutes.post('/generate', RoutePlanController.generate);
// สร้างแผนใหม่ที่ต่างจากแผนเดิม
routePlanRoutes.post('/recalculate', RoutePlanController.recalculate);
routePlanRoutes.get('/', RoutePlanController.list);
// แสดงแผนเดียว
routePlanRoutes.get('/:id', RoutePlanController.get);
// เลือกแผน
routePlanRoutes.post('/:id/select', RoutePlanController.select);
// ลบแผน
routePlanRoutes.delete('/:id', RoutePlanController.delete);
