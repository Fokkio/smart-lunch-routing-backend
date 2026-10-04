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
    if (!Number.isInteger(input.boxes) || (input.boxes as number) < 1 || (input.boxes as number) > 3) {
      throw Object.assign(new Error('boxes is required and must be an integer between 1 and 3'), {
        statusCode: 400,
      });
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

  static async delete(id: string): Promise<boolean> {
    try {
      return await OrderModel.delete(id);
    } catch (error) {
      // ฐานข้อมูลปฏิเสธการลบ เพราะออเดอร์อยู่ในใบงานที่ยืนยันแล้ว
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ER_ROW_IS_REFERENCED_2'
      ) {
        throw Object.assign(
          new Error('Cannot delete order that is part of a confirmed delivery plan'),
          { statusCode: 409 },
        );
      }

      throw error;
    }
  }
}

function normalizeStatus<T extends Partial<OrderInput>>(input: T): T {
  return input.status
    ? { ...input, status: input.status.toUpperCase() as OrderStatus }
    : input;
}
