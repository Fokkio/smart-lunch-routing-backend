// ไฟล์นี้: รับ-ส่ง HTTP เรื่องลูกค้า แล้วส่งต่อให้ CustomerService ทำงาน (ไม่มี SQL ตรงนี้)
import type { NextFunction, Request, Response } from 'express';
import { CustomerService } from '../services/customer.service';
import { parseNearbyQuery } from './request-validation';
import { ShopSettingsModel } from '../models/shop-settings.model';

/** Thin HTTP adapter — no SQL, no business rules here. */
// คลาสรับ-ส่ง HTTP เรื่องลูกค้า: แค่รับ request แล้วส่งต่อให้ CustomerService (ไม่มี SQL ตรงนี้)
export class CustomerController {
// แสดงลูกค้าทั้งหมด หรือค้นหาด้วยคำค้นถ้าส่ง search มา
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = typeof req.query['search'] === 'string' ? req.query['search'].trim() : '';
      if (search) {
        res.json(await CustomerService.search(search));
        return;
      }
      res.json(await CustomerService.findAll());
    } catch (err) {
      next(err);
    }
  }

// แสดงลูกค้าที่อยู่ใกล้ร้าน: ใช้พิกัดร้านจากค่าตั้งร้านเป็นจุดศูนย์กลาง แล้วค้นในรัศมีที่ขอ
  static async nearby(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shop = await ShopSettingsModel.get();
      const { lat, lng, radiusKm } = parseNearbyQuery(
        String(shop.latitude),
        String(shop.longitude),
        req.query['radiusKm'],
        1,
      );
      res.json(await CustomerService.findNearby(lat, lng, radiusKm));
    } catch (err) {
      next(err);
    }
  }

// แสดงลูกค้าคนเดียวตาม id ถ้าไม่เจอตอบ 404
  static async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customer = await CustomerService.findById(req.params['id'] as string);
      if (!customer) {
        res.status(404).json({ message: 'Customer not found' });
        return;
      }
      res.json(customer);
    } catch (err) {
      next(err);
    }
  }

// สร้างลูกค้าใหม่: รับ body ส่งให้ service แล้วตอบ 201 พร้อมข้อมูลที่สร้าง
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(201).json(await CustomerService.create(req.body));
    } catch (err) {
      next(err);
    }
  }

// แก้ไขลูกค้าตาม id ถ้าไม่เจอตอบ 404
  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customer = await CustomerService.update(req.params['id'] as string, req.body);
      if (!customer) {
        res.status(404).json({ message: 'Customer not found' });
        return;
      }
      res.json(customer);
    } catch (err) {
      next(err);
    }
  }

// ลบลูกค้าตาม id ถ้าไม่เจอตอบ 404 ถ้าลบได้ตอบ 204 ไม่มี body
  static async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deleted = await CustomerService.delete(req.params['id'] as string);
      if (!deleted) {
        res.status(404).json({ message: 'Customer not found' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
}
