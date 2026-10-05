import type { NextFunction, Request, Response } from 'express';
import { OrderService } from '../services/order.service';
import { parseNearbyQuery, parseSimulationRequest } from './request-validation';
import { validDate } from '../services/input-validation';

/** Thin HTTP adapter — no SQL, no business rules here. */
export class OrderController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json(await OrderService.findAll({
        status: typeof req.query['status'] === 'string' ? req.query['status'] : undefined,
        date: typeof req.query['date'] === 'string' ? req.query['date'] : undefined,
        customerId: typeof req.query['customerId'] === 'string' ? req.query['customerId'] : undefined,
      }));
    } catch (err) {
      next(err);
    }
  }

  static async nearby(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { lat, lng, radiusKm } = parseNearbyQuery(
        req.query['lat'],
        req.query['lng'],
        req.query['radiusKm'],
        2,
      );
      const date = req.query['date'];
      const status = req.query['status'];
      if ((date !== undefined && !validDate(date)) || (status !== undefined && (typeof status !== 'string' || !['PENDING','PLANNED','DELIVERING','DELIVERED','CANCELLED'].includes(status)))) {
        res.status(400).json({ message: 'Invalid date or order status' }); return;
      }
      res.json(await OrderService.findNearby(lat, lng, radiusKm, {date: date as string | undefined,status: status as string | undefined}));
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

  static async simulate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { count, orderDate } = parseSimulationRequest(req.body?.count, req.body?.orderDate);
      const orders = await OrderService.createSimulated(count, orderDate);
      res.status(201).json({ createdCount: orders.length, orders });
    } catch (err) {
      next(err);
    }
  }

  static async clearSimulated(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ deletedCount: await OrderService.deleteSimulated(req.body?.orderIds) });
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
