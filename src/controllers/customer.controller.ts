import type { NextFunction, Request, Response } from 'express';
import { CustomerService } from '../services/customer.service';

/** Thin HTTP adapter — no SQL, no business rules here. */
export class CustomerController {
  static async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json(await CustomerService.findAll());
    } catch (err) {
      next(err);
    }
  }

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

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(201).json(await CustomerService.create(req.body));
    } catch (err) {
      next(err);
    }
  }

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
