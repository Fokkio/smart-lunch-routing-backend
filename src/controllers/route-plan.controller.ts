// ไฟล์นี้: รับ-ส่ง HTTP เรื่องแผนจัดส่ง แล้วส่งต่อให้ RoutePlanningService
import type { NextFunction, Request, Response } from 'express';
import { RoutePlanningService } from '../services/route-planning.service';
import { validateId, validDate } from '../services/input-validation';


/** HTTP adapter for RoutePlan generation/listing/selection (no business logic). */
// คลาสรับ-ส่ง HTTP เรื่องแผนจัดส่ง: แค่รับ request แล้วส่งต่อให้ RoutePlanningService
export class RoutePlanController {
// สร้างแผนจัดส่งใหม่ตามวันที่ที่ขอ แล้วตอบ 201 พร้อมแผนที่บันทึกแล้ว
  static async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const planDate = validatedDate(req.body?.planDate, res);
      if (!planDate) return;
      res.status(201).json(await RoutePlanningService.generate(planDate, {startTime:req.body?.startTime,deadline:req.body?.deadline,orderIds:req.body?.orderIds}));
    } catch (error) {
      next(error);
    }
  }

  /** Deterministic alternative: creates a NEW plan, never mutates the old one. */
// สร้างแผนใหม่ที่ต่างจากแผนเดิม (ไม่แก้แผนเก่า) แล้วตอบ 201
  static async recalculate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const planDate = validatedDate(req.body?.planDate, res);
      if (!planDate) return;
      res.status(201).json(await RoutePlanningService.generateAlternative(planDate, {startTime:req.body?.startTime,deadline:req.body?.deadline,orderIds:req.body?.orderIds,basePlanId:req.body?.basePlanId}));
    } catch (error) {
      next(error);
    }
  }

// แสดงสรุปแผนทั้งหมด กรองตามวันที่ได้ วันที่ต้องเป็น YYYY-MM-DD
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const date = typeof req.query['date'] === 'string' ? req.query['date'] : undefined;
      if (date && !validDate(date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' });
        return;
      }
      res.json(await RoutePlanningService.list(date));
    } catch (error) {
      next(error);
    }
  }

// แสดงแผนเดียวตาม id ถ้าไม่เจอตอบ 404
  static async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      validateId(req.params['id']!);
      const plan = await RoutePlanningService.findById(Number(req.params['id']));
      if (!plan) {
        res.status(404).json({ message: 'RoutePlan not found' });
        return;
      }
      res.json(plan);
    } catch (error) {
      next(error);
    }
  }

// เลือกแผนตาม id พร้อมกำหนดไรเดอร์ให้แต่ละงาน ถ้าเลือกไม่ได้ตอบ 404
  static async select(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      validateId(req.params['id']!);
      const plan = await RoutePlanningService.select(Number(req.params['id']), req.body?.assignments);
      if (!plan) {
        res.status(404).json({ message: 'RoutePlan not found or not selectable' });
        return;
      }
      res.json(plan);
    } catch (error) {
      next(error);
    }
  }

// ลบแผนตาม id ถ้าไม่เจอตอบ 404 ถ้าลบได้ตอบ 204
  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      validateId(req.params['id']!);
      const deleted = await RoutePlanningService.delete(Number(req.params['id']));
      if (!deleted) {
        res.status(404).json({ message: 'RoutePlan not found' });
        return;
      }
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  }

}

// ตรวจว่าวันที่ที่ส่งมาเป็น YYYY-MM-DD ไหม ถ้าไม่ถูกตอบ 400 และคืน null
function validatedDate(value: unknown, res: Response): string | null {
  if (!validDate(value)) {
    res.status(400).json({ message: 'planDate must be YYYY-MM-DD' });
    return null;
  }
  return value;
}
