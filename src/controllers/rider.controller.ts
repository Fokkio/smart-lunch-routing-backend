// ไฟล์นี้: รับ-ส่ง HTTP เรื่องไรเดอร์ แล้วส่งต่อให้ RiderService
import type { NextFunction, Request, Response } from 'express';
import { RiderService } from '../services/rider.service';

/** Thin HTTP adapter — no SQL, no business rules here. */
// คลาสรับ-ส่ง HTTP เรื่องไรเดอร์: แค่รับ request แล้วส่งต่อให้ RiderService (ไม่มี SQL ตรงนี้)
export class RiderController {
// แสดงไรเดอร์ทั้งหมด หรือเฉพาะคนที่ว่างถ้าส่ง available=true มา
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.query['available'] === 'true') {
        res.json(await RiderService.findAvailable());
        return;
      }
      res.json(await RiderService.findAll());
    } catch (err) {
      next(err);
    }
  }

// สร้างไรเดอร์ใหม่: รับ body ส่งให้ service แล้วตอบ 201
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(201).json(await RiderService.create(req.body));
    } catch (err) {
      next(err);
    }
  }

// แก้ไขไรเดอร์ตาม id ถ้าไม่เจอตอบ 404
  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rider = await RiderService.update(req.params['id'] as string, req.body);
      if (!rider) {
        res.status(404).json({ message: 'Rider not found' });
        return;
      }
      res.json(rider);
    } catch (err) {
      next(err);
    }
  }

// ลบไรเดอร์ตาม id ถ้าไม่เจอตอบ 404 ถ้าลบได้ตอบ 204
  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deleted = await RiderService.delete(req.params['id'] as string);
      if (!deleted) {
        res.status(404).json({ message: 'Rider not found' });
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
}
