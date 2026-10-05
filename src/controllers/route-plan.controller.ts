import type { NextFunction, Request, Response } from 'express';
import { RoutePlanningService } from '../services/route-planning.service';
import { validateId, validDate } from '../services/input-validation';


/** HTTP adapter for RoutePlan generation/listing/selection (no business logic). */
export class RoutePlanController {
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
  static async recalculate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const planDate = validatedDate(req.body?.planDate, res);
      if (!planDate) return;
      res.status(201).json(await RoutePlanningService.generateAlternative(planDate, {startTime:req.body?.startTime,deadline:req.body?.deadline,orderIds:req.body?.orderIds}));
    } catch (error) {
      next(error);
    }
  }

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

function validatedDate(value: unknown, res: Response): string | null {
  if (!validDate(value)) {
    res.status(400).json({ message: 'planDate must be YYYY-MM-DD' });
    return null;
  }
  return value;
}
