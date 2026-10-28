// ไฟล์นี้: ผูก path ของออเดอร์เข้ากับ OrderController
import { Router } from 'express';
import { OrderController } from '../controllers/order.controller';

export const orderRoutes = Router();

orderRoutes.get('/', OrderController.list);
// แสดงออเดอร์ที่อยู่ใกล้ร้าน
orderRoutes.get('/nearby', OrderController.nearby);
// สร้างออเดอร์จำลอง
orderRoutes.post('/simulate', OrderController.simulate);
// ลบออเดอร์จำลอง
orderRoutes.delete('/simulated', OrderController.clearSimulated);
// แสดงออเดอร์เดียว
orderRoutes.get('/:id', OrderController.get);
orderRoutes.post('/', OrderController.create);
// แก้ไขออเดอร์
orderRoutes.put('/:id', OrderController.update);
// ลบออเดอร์
orderRoutes.delete('/:id', OrderController.remove);
