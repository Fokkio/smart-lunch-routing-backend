import type { NextFunction, Request, Response } from 'express';
import { RiderService } from '../services/rider.service';

/** Thin HTTP adapter — no SQL, no business rules here. */
export class RiderController {
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

  static async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rider = await RiderService.findById(req.params['id'] as string);
      if (!rider) {
        res.status(404).json({ message: 'Rider not found' });
        return;
      }
      res.json(rider);
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(201).json(await RiderService.create(req.body));
    } catch (err) {
      next(err);
    }
  }

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
}
