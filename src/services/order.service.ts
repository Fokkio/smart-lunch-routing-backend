import {
  OrderModel,
  type NearbyOrder,
  type Order,
  type OrderFilter,
  type OrderInput,
  type OrderStatus,
} from '../models/order.model';
import { todayLocal } from '../models/dates';
import { badInput, validateId, validateObject, validDate } from './input-validation';

const ORDER_STATUSES: OrderStatus[] = ['PENDING', 'PLANNED', 'DELIVERING', 'DELIVERED', 'CANCELLED'];

function validate(input: Partial<OrderInput>): void {
  validateObject(input);
  if (input.customerId !== undefined && (!Number.isSafeInteger(input.customerId) || input.customerId < 1)) badInput('customerId must be a positive integer');
  if (input.orderDate !== undefined && !validDate(input.orderDate)) badInput('orderDate must be a valid YYYY-MM-DD date');
  if (input.boxes !== undefined && (!Number.isInteger(input.boxes) || input.boxes < 1 || input.boxes > 3)) {
    throw Object.assign(new Error('boxes must be an integer between 1 and 3'), { statusCode: 400 });
  }
  if (input.status !== undefined && (typeof input.status !== 'string' || !ORDER_STATUSES.includes(input.status.toUpperCase() as OrderStatus))) {
    throw Object.assign(new Error(`status must be one of ${ORDER_STATUSES.join(', ')}`), { statusCode: 400 });
  }
}

export class OrderService {
  static findAll(filter?: OrderFilter): Promise<Order[]> {
    if (filter?.date !== undefined && !validDate(filter.date)) badInput('date must be a valid YYYY-MM-DD date');
    if (filter?.customerId !== undefined) validateId(filter.customerId);
    if (filter?.status !== undefined && !ORDER_STATUSES.includes(filter.status.toUpperCase() as OrderStatus)) badInput('Invalid order status');
    return OrderModel.findAll(filter);
  }

  static findPending(): Promise<Order[]> {
    return OrderModel.findPending();
  }

  static findNearby(lat: number, lng: number, radiusKm: number, filter: {date?:string;status?:string} = {}): Promise<NearbyOrder[]> {
    return OrderModel.findNearby(lat, lng, radiusKm, filter);
  }

  static findById(id: string): Promise<Order | null> {
    validateId(id);
    return OrderModel.findById(id);
  }

  static create(input: OrderInput): Promise<Order> {
    validate(input);
    if (input.status !== undefined && input.status.toUpperCase() !== 'PENDING') badInput('New orders must be PENDING');
    if (!Number.isInteger(input.customerId) || input.customerId < 1) {
      throw Object.assign(new Error('customerId must be a positive integer'), { statusCode: 400 });
    }
    if (!Number.isInteger(input.boxes) || (input.boxes as number) < 1 || (input.boxes as number) > 3) {
      throw Object.assign(new Error('boxes is required and must be an integer between 1 and 3'), {
        statusCode: 400,
      });
    }
    return OrderModel.create(normalizeStatus(input)).catch(handleOrderWriteError);
  }

  static createSimulated(count: number, orderDate = todayLocal()): Promise<Order[]> {
    return OrderModel.createSimulated(count, orderDate);
  }

  static async deleteSimulated(orderIds: number[]): Promise<number> {
    if (!Array.isArray(orderIds) || !orderIds.length || orderIds.length > 500 || orderIds.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(orderIds).size !== orderIds.length) badInput('Choose 1–500 distinct positive order IDs');
    try {
      return await OrderModel.deleteSimulated(orderIds);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error &&
          (error as { code?: unknown }).code === 'ER_ROW_IS_REFERENCED_2') {
        throw Object.assign(
          new Error('Simulated orders are in route plans. Delete those plans before clearing simulated orders.'),
          { statusCode: 409 },
        );
      }
      throw error;
    }
  }

  static update(id: string, input: Partial<OrderInput>): Promise<Order | null> {
    validateId(id);
    validate(input);
    if (input.status !== undefined && !['PENDING', 'CANCELLED'].includes(input.status.toUpperCase())) badInput('Delivery statuses can only change through delivery jobs');
    return OrderModel.update(id, normalizeStatus(input)).catch(handleOrderWriteError);
  }

  static async delete(id: string): Promise<boolean> {
    validateId(id);
    try {
      return await OrderModel.delete(id);
    } catch (error) {
      // ฐานข้อมูลปฏิเสธการลบเมื่อออเดอร์อยู่ในแผนใด ๆ รวมถึงแผนฉบับร่าง
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ER_ROW_IS_REFERENCED_2'
      ) {
        throw Object.assign(
          new Error('Cannot delete order that is part of a delivery plan'),
          { statusCode: 409 },
        );
      }

      throw error;
    }
  }
}

function handleOrderWriteError(error: unknown): never {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_NO_REFERENCED_ROW_2') {
    badInput('Customer does not exist');
  }
  throw error;
}

function normalizeStatus<T extends Partial<OrderInput>>(input: T): T {
  return input.status
    ? { ...input, status: input.status.toUpperCase() as OrderStatus }
    : input;
}
