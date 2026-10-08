import {
  CustomerModel,
  type Customer,
  type CustomerInput,
  type CustomerWithDistance,
} from '../models/customer.model';

import { badInput, validateId, validateObject } from './input-validation';

// เก็บเบอร์ในรูปแบบเดียวกัน โดยรักษาเลข 0 ด้านหน้า
function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, '');
}

function validate(input: Partial<CustomerInput>): void {
  validateObject(input, 'customer data must be an object');

  for (const field of ['first_name', 'last_name'] as const) {
    if (input[field] !== undefined && typeof input[field] !== 'string') {
      badInput(`${field} must be a string`);
    }
  }

  // NAME
  if (input.name !== undefined) {
    // ตรวจว่าเป็น string และห้ามว่าง
    if (typeof input.name !== 'string' || input.name.trim() === '') {
      badInput('name must be a non-empty string');
    }

    // นับตัวอักษรให้เท่ากับความยาวช่องในฐานข้อมูล
    if (Array.from(input.name).length > 150) {
      badInput('name must not exceed 150 characters');
    }
  }

  // Phone number
  // เบอร์โทรต้องเป็นข้อความ เพื่อรักษาเลข 0 ด้านหน้า
  // ตอนแก้ไข ถ้าไม่ส่ง phone มา ให้ใช้ค่าเดิม
  if (input.phone !== undefined) {
    // ตรวจว่าเป็น string และห้ามว่าง
    if (typeof input.phone !== 'string' || input.phone.trim() === '') {
      badInput('phone must be a non-empty string');
    }

    // หลังตัดขีดและช่องว่าง ต้องเป็นมือถือ 10 หลัก
    const phone = normalizePhone(input.phone);

    // ความยาวต้องตรงกับฐานข้อมูล
    if (!/^0[689]\d{8}$/.test(phone)) {
      badInput('phone must be a 10-digit Thai mobile number starting with 06, 08 or 09');
    }
  }

  // ที่อยู่ไม่บังคับกรอก แต่ถ้ามีค่าต้องเป็นข้อความหรือ null
  if (input.address !== undefined && input.address !== null && typeof input.address !== 'string') {
    badInput('address must be a string or null');
  }

  // พิกัด lat lng
  if (
    input.lat !== undefined &&
    (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90)
  ) {
    badInput('latitude must be between -90 and 90');
  }
  if (
    input.lng !== undefined &&
    (!Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180)
  ) {
    badInput('longitude must be between -180 and 180');
  }
}

// แปลงข้อผิดพลาดเบอร์ซ้ำจากฐานข้อมูลเป็น HTTP 409
function handleCustomerWriteError(error: unknown): never {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ER_DUP_ENTRY'
  ) {
    throw Object.assign(new Error('Phone number is already used by another customer'), {
      statusCode: 409,
    });
  }

  throw error;
}

export class CustomerService {
  static findAll(): Promise<Customer[]> {
    return CustomerModel.findAll();
  }

  static search(query: string): Promise<Customer[]> {
    return CustomerModel.search(query);
  }

  static findNearby(lat: number, lng: number, radiusKm: number): Promise<CustomerWithDistance[]> {
    return CustomerModel.searchNearby(lat, lng, radiusKm);
  }

  static findById(id: string): Promise<Customer | null> {
    validateId(id, 'customer id must be a positive integer');
    return CustomerModel.findById(id);
  }

  static async create(input: CustomerInput): Promise<Customer> {
    // check input first
    validate(input);

    const name = (
      input.name?.trim() || `${input.first_name ?? ''} ${input.last_name ?? ''}`
    ).trim();
    const effectiveInput = { ...input, name };
    validate(effectiveInput);

    // การสร้างลูกค้าใหม่ต้องส่งข้อมูลจำเป็นให้ครบ
    if (
      !effectiveInput.name ||
      !effectiveInput.phone?.trim() ||
      effectiveInput.lat === undefined ||
      effectiveInput.lng === undefined
    ) {
      badInput('name, phone, lat and lng are required');
    }
    try {
      return await CustomerModel.create({
        ...effectiveInput,
        phone: normalizePhone(effectiveInput.phone),
      });
    } catch (error) {
      handleCustomerWriteError(error);
    }
  }

  static async update(id: string, input: Partial<CustomerInput>): Promise<Customer | null> {
    validateId(id, 'customer id must be a positive integer');
    validate(input);

    const name =
      input.name?.trim() ||
      [input.first_name, input.last_name].filter(Boolean).join(' ').trim() ||
      input.name;
    const effectiveInput = name !== undefined ? { ...input, name } : input;
    validate(effectiveInput);

    // ถ้าแก้เฉพาะชื่อโดยไม่ส่งเบอร์มา ให้คงเบอร์เดิมไว้
    const normalizedInput =
      effectiveInput.phone === undefined
        ? effectiveInput
        : { ...effectiveInput, phone: normalizePhone(effectiveInput.phone) };

    try {
      return await CustomerModel.update(id, normalizedInput);
    } catch (error) {
      handleCustomerWriteError(error);
    }
  }

  // DELETE
  static async delete(id: string): Promise<boolean> {
    validateId(id, 'customer id must be a positive integer');

    try {
      return await CustomerModel.delete(id);
    } catch (error) {
      // ฐานข้อมูลปฏิเสธการลบ เพราะมีข้อมูลอื่นอ้างอิงลูกค้านี้
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ER_ROW_IS_REFERENCED_2'
      ) {
        throw Object.assign(new Error('Cannot delete customer with existing orders'), {
          statusCode: 409,
        });
      }

      // ข้อผิดพลาดอื่นส่งต่อ ไม่เหมารวมว่าเกิดจากออเดอร์
      throw error;
    }
  }
}
