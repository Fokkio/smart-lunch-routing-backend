// ไฟล์นี้: ตรวจข้อมูลไรเดอร์ก่อนบันทึก และเรียก RiderModel
import { RiderModel, type Rider, type RiderInput } from '../models/rider.model';
import { badInput, validateId, validateObject } from './input-validation';

// ตรวจข้อมูลไรเดอร์: ชื่อ 1-150 ตัวอักษร เบอร์ต้องเป็นมือถือไทย 10 หลัก แล้วตัดช่องว่างชื่อและจัดรูปแบบเบอร์
function validate(input: Partial<RiderInput>, creating = false): Partial<RiderInput> {
  validateObject(input);
  if ((creating && input.name === undefined) || (input.name !== undefined &&
      (typeof input.name !== 'string' || !input.name.trim() || Array.from(input.name.trim()).length > 150))) badInput('name must contain 1-150 characters');
  if (input.isAvailable !== undefined && typeof input.isAvailable !== 'boolean') badInput('isAvailable must be a boolean');
  let phone = input.phone;
  if (phone !== undefined && phone !== null) {
    if (typeof phone !== 'string') badInput('phone must be a string or null');
    phone = phone.replace(/[\s-]/g, '');
    if (!/^0[689]\d{8}$/.test(phone)) badInput('phone must be a valid Thai mobile number');
  }
  return { ...input, ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(phone !== undefined ? { phone } : {}) };
}

/** Rider application workflow. CRUD + availability lookup. */

// แปลงข้อผิดพลาดเบอร์ซ้ำจากฐานข้อมูลเป็น HTTP 409 (แบบเดียวกับลูกค้า)
function handleRiderWriteError(error: unknown): never {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ER_DUP_ENTRY'
  ) {
    throw Object.assign(
      new Error('Phone number is already used by another rider'),
      { statusCode: 409 },
    );
  }

  throw error;
}

// คลาสตรวจข้อมูลไรเดอร์ก่อนบันทึก แล้วเรียก RiderModel
export class RiderService {
// ดึงไรเดอร์ทั้งหมดผ่าน model
  static findAll(): Promise<Rider[]> {
    return RiderModel.findAll();
  }

// ดึงไรเดอร์คนเดียวตาม id: ตรวจก่อนว่า id เป็นจำนวนเต็มบวก
  static findById(id: string): Promise<Rider | null> {
    validateId(id);
    return RiderModel.findById(id);
  }

// ดึงไรเดอร์ที่พร้อมรับงานผ่าน model
  static findAvailable(): Promise<Rider[]> {
    return RiderModel.findAvailable();
  }

// สร้างไรเดอร์ใหม่: ตรวจข้อมูลแบบตอนสร้าง (ชื่อบังคับ) แล้วแปลง error เบอร์ซ้ำเป็น 409
  static async create(input: RiderInput): Promise<Rider> {
    try {
      return await RiderModel.create(validate(input, true) as RiderInput);
    } catch (error) {
      handleRiderWriteError(error);
    }
  }

// แก้ไขไรเดอร์: ตรวจ id และข้อมูลก่อน แล้วแปลง error เบอร์ซ้ำเป็น 409
  static async update(id: string, input: Partial<RiderInput>): Promise<Rider | null> {
    validateId(id);
    try {
      return await RiderModel.update(id, validate(input));
    } catch (error) {
      handleRiderWriteError(error);
    }
  }

// ลบไรเดอร์: ตรวจ id ก่อน ถ้าฐานข้อมูลปฏิเสธเพราะมีข้อมูลจัดส่งอ้างอิงอยู่แปลงเป็น 409
  static async delete(id: string): Promise<boolean> {
    validateId(id);
    try {
      return await RiderModel.delete(id);
    } catch (error) {
      // ฐานข้อมูลปฏิเสธการลบ เพราะไรเดอร์ถูกอ้างอิงโดยข้อมูลการจัดส่ง
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ER_ROW_IS_REFERENCED_2'
      ) {
        throw Object.assign(
          new Error('Cannot delete rider that is referenced by delivery records'),
          { statusCode: 409 },
        );
      }
      throw error;
    }
  }
}
