import {
  OrderModel,
  type NearbyOrder,
  type Order,
  type OrderFilter,
  type OrderInput,
  type OrderStatus,
} from '../models/order.model';
import { todayLocal } from '../models/dates';

const ORDER_STATUSES: OrderStatus[] = ['PENDING', 'PLANNED', 'DELIVERING', 'DELIVERED', 'CANCELLED'];

function validate(input: Partial<OrderInput>): void {
  if (input.boxes !== undefined && (!Number.isInteger(input.boxes) || input.boxes < 1 || input.boxes > 3)) {
    throw Object.assign(new Error('boxes must be an integer between 1 and 3'), { statusCode: 400 });
  }
  if (input.status !== undefined && !ORDER_STATUSES.includes(input.status.toUpperCase() as OrderStatus)) {
    throw Object.assign(new Error(`status must be one of ${ORDER_STATUSES.join(', ')}`), { statusCode: 400 });
  }
}

export class OrderService {
  static findAll(filter?: OrderFilter): Promise<Order[]> {
    return OrderModel.findAll(filter);
  }

  static findPending(): Promise<Order[]> {
    return OrderModel.findPending();
  }

  static findNearby(lat: number, lng: number, radiusKm: number): Promise<NearbyOrder[]> {
    return OrderModel.findNearby(lat, lng, radiusKm);
  }

  static findById(id: string): Promise<Order | null> {
    return OrderModel.findById(id);
  }

  static create(input: OrderInput): Promise<Order> {
    if (!Number.isInteger(input.customerId) || input.customerId < 1) {
      throw Object.assign(new Error('customerId must be a positive integer'), { statusCode: 400 });
    }
    validate(input);
    return OrderModel.create(normalizeStatus(input));
  }

  static createSimulated(count: number, orderDate = todayLocal()): Promise<Order[]> {
    return OrderModel.createSimulated(count, orderDate);
  }

  static deleteSimulated(): Promise<number> {
    return OrderModel.deleteSimulated();
  }

  static update(id: string, input: Partial<OrderInput>): Promise<Order | null> {
    validate(input);
    return OrderModel.update(id, normalizeStatus(input));
  }

  static delete(id: string): Promise<boolean> {
    return OrderModel.delete(id);
  }
}

function normalizeStatus<T extends Partial<OrderInput>>(input: T): T {
  return input.status
    ? { ...input, status: input.status.toUpperCase() as OrderStatus }
    : input;
}
