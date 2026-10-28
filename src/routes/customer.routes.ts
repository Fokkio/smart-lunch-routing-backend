// ไฟล์นี้: ผูก path ของลูกค้าเข้ากับ CustomerController
import { Router } from 'express';
import { CustomerController } from '../controllers/customer.controller';

export const customerRoutes = Router();

customerRoutes.get('/', CustomerController.list);
// แสดงลูกค้าที่อยู่ใกล้ร้าน
customerRoutes.get('/nearby', CustomerController.nearby);
// แสดงลูกค้าคนเดียว
customerRoutes.get('/:id', CustomerController.get);
customerRoutes.post('/', CustomerController.create);
// แก้ไขลูกค้า
customerRoutes.put('/:id', CustomerController.update);
// ลบลูกค้า
customerRoutes.delete('/:id', CustomerController.remove);

