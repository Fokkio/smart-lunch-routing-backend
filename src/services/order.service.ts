// ไฟล์นี้: ตรวจข้อมูลออเดอร์ก่อนบันทึก และเรียก OrderModel
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

// ตรวจข้อมูลออเดอร์: ลูกค้าต้องเป็นจำนวนเต็มบวก วันที่ต้องถูกฟอร์แมต กล่องต้อง 1-3 กล่อง และสถานะต้องอยู่ในรายการที่ยอมรับ
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

// คลาสตรวจข้อมูลออเดอร์ก่อนบันทึก แล้วเรียก OrderModel
export class OrderService {
// ดึงออเดอร์ทั้งหมด: ตรวจวันที่ ลูกค้า และสถานะในตัวกรองก่อน แล้วเรียก model
  static findAll(filter?: OrderFilter): Promise<Order[]> {
    if (filter?.date !== undefined && !validDate(filter.date)) badInput('date must be a valid YYYY-MM-DD date');
    if (filter?.customerId !== undefined) validateId(filter.customerId);
    if (filter?.status !== undefined && !ORDER_STATUSES.includes(filter.status.toUpperCase() as OrderStatus)) badInput('Invalid order status');
    return OrderModel.findAll(filter);
  }

// ดึงออเดอร์ที่ยังค้างส่ง (PENDING) ทั้งหมด
  static findPending(): Promise<Order[]> {
    return OrderModel.findPending();
  }

// ดึงออเดอร์ที่อยู่ในรัศมีที่กำหนดผ่าน model
  static findNearby(lat: number, lng: number, radiusKm: number, filter: {date?:string;status?:string} = {}): Promise<NearbyOrder[]> {
    return OrderModel.findNearby(lat, lng, radiusKm, filter);
  }

// ดึงออเดอร์เดียวตาม id: ตรวจก่อนว่า id เป็นจำนวนเต็มบวก
  static findById(id: string): Promise<Order | null> {
    validateId(id);
    return OrderModel.findById(id);
  }

// สร้างออเดอร์ใหม่: ออเดอร์ใหม่ต้องเป็น PENDING กล่องต้อง 1-3 กล่อง และลูกค้าต้องมีอยู่จริง
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

// สร้างออเดอร์จำลองตามจำนวนที่ขอ: วันที่ว่างใช้วันนี้
  static createSimulated(count: number, orderDate = todayLocal()): Promise<Order[]> {
    return OrderModel.createSimulated(count, orderDate);
  }

// ลบออเดอร์จำลอง: รายการ id ต้อง 1-500 รายการ ไม่ซ้ำ และเป็นจำนวนเต็มบวก
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

// แก้ไขออเดอร์: สถานะเปลี่ยนได้แค่ PENDING/CANCELLED เท่านั้น สถานะส่งของเปลี่ยนผ่านใบงานเท่านั้น
  static update(id: string, input: Partial<OrderInput>): Promise<Order | null> {
    validateId(id);
    validate(input);
    if (input.status !== undefined && !['PENDING', 'CANCELLED'].includes(input.status.toUpperCase())) badInput('Delivery statuses can only change through delivery jobs');
    return OrderModel.update(id, normalizeStatus(input)).catch(handleOrderWriteError);
  }

// ลบออเดอร์: ตรวจ id ก่อน ถ้าออเดอร์อยู่ในแผนแปลง error เป็น 409
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

// แปลง error ลูกค้าไม่มีอยู่จริงจากฐานข้อมูลให้เป็น 400 ส่วน error อื่นส่งต่อเหมือนเดิม
function handleOrderWriteError(error: unknown): never {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_NO_REFERENCED_ROW_2') {
    badInput('Customer does not exist');
  }
  throw error;
}

// ปรับสถานะออเดอร์ให้เป็นตัวพิมพ์ใหญ่ทั้งหมดก่อนบันทึก
function normalizeStatus<T extends Partial<OrderInput>>(input: T): T {
  return input.status
    ? { ...input, status: input.status.toUpperCase() as OrderStatus }
    : input;
}
