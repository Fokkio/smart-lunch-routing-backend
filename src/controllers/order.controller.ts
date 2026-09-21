import type { NextFunction, Request, Response } from 'express';
import { OrderService } from '../services/order.service';

/** Thin HTTP adapter — no SQL, no business rules here. */
export class OrderController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Case-insensitive: ?status=PENDING must filter exactly like ?status=pending.
      if (String(req.query['status'] ?? '').toLowerCase() === 'pending') {
        res.json(await OrderService.findPending());
        return;
      }
      res.json(await OrderService.findAll());
    } catch (err) {
      next(err);
    }
  }

  static async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const order = await OrderService.findById(req.params['id'] as string);
      if (!order) {
        res.status(404).json({ message: 'Order not found' });
        return;
      }
      res.json(order);
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(201).json(await OrderService.create(req.body));
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const order = await OrderService.update(req.params['id'] as string, req.body);
      if (!order) {
        res.status(404).json({ message: 'Order not found' });
        return;
      }
      res.json(order);
    } catch (err) {
      next(err);
    }
  }

  static async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deleted = await OrderService.delete(req.params['id'] as string);
      if (!deleted) {
        res.status(404).json({ message: 'Order not found' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
}
