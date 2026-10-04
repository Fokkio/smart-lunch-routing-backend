import { RiderModel, type Rider, type RiderInput } from '../models/rider.model';

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

export class RiderService {
  static findAll(): Promise<Rider[]> {
    return RiderModel.findAll();
  }

  static findById(id: string): Promise<Rider | null> {
    return RiderModel.findById(id);
  }

  static findAvailable(): Promise<Rider[]> {
    return RiderModel.findAvailable();
  }

  static async create(input: RiderInput): Promise<Rider> {
    try {
      return await RiderModel.create(input);
    } catch (error) {
      handleRiderWriteError(error);
    }
  }

  static async update(id: string, input: Partial<RiderInput>): Promise<Rider | null> {
    try {
      return await RiderModel.update(id, input);
    } catch (error) {
      handleRiderWriteError(error);
    }
  }

  static async delete(id: string): Promise<boolean> {
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
