import type { NextFunction, Request, Response } from 'express';
import { RoutePlanningService } from '../services/route-planning.service';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** HTTP adapter for RoutePlan generation/listing/selection (no business logic). */
export class RoutePlanController {
  static async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const planDate = validatedDate(req.body?.planDate, res);
      if (!planDate) return;
      res.status(201).json(await RoutePlanningService.generate(planDate));
    } catch (error) {
      next(error);
    }
  }

  /** Deterministic alternative: creates a NEW plan, never mutates the old one. */
  static async recalculate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const planDate = validatedDate(req.body?.planDate, res);
      if (!planDate) return;
      res.status(201).json(await RoutePlanningService.generateAlternative(planDate));
    } catch (error) {
      next(error);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const date = typeof req.query['date'] === 'string' ? req.query['date'] : undefined;
      if (date && !DATE_PATTERN.test(date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' });
        return;
      }
      res.json(await RoutePlanningService.list(date));
    } catch (error) {
      next(error);
    }
  }

  static async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
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

  static async select(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plan = await RoutePlanningService.select(Number(req.params['id']));
      if (!plan) {
        res.status(404).json({ message: 'RoutePlan not found or not selectable' });
        return;
      }
      res.json(plan);
    } catch (error) {
      next(error);
    }
  }
}

function validatedDate(value: unknown, res: Response): string | null {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    res.status(400).json({ message: 'planDate must be YYYY-MM-DD' });
    return null;
  }
  return value;
}
