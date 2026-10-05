import {
  CustomerModel,
  type Customer,
  type CustomerInput,
  type CustomerWithDistance,
} from "../models/customer.model";

// เก็บเบอร์ในรูปแบบเดียวกัน โดยรักษาเลข 0 ด้านหน้า
function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, "");
}

function validate(input: Partial<CustomerInput>): void {
  // ต้องได้รับข้อมูลลูกค้าเป็น object ก่อน จึงอ่าน name/phone ได้ (ถ้าตรวจแค่ name เวลา null ทั้งก้อน ตอนอ่านจะพัง)
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw Object.assign(new Error("customer data must be an object"), {
      statusCode: 400,
    });
  }

  for (const field of ['first_name', 'last_name'] as const) {
    if (input[field] !== undefined && typeof input[field] !== 'string') {
      throw Object.assign(new Error(`${field} must be a string`), { statusCode: 400 });
    }
  }

  // NAME
  if (input.name !== undefined) {
    // ตรวจว่าเป็น string และห้ามว่าง
    if (typeof input.name !== "string" || input.name.trim() === "") {
      throw Object.assign(new Error("name must be a non-empty string"), {
        statusCode: 400,
      });
    }

    // นับตัวอักษรให้เท่ากับความยาวช่องในฐานข้อมูล
    if (Array.from(input.name).length > 150) {
      throw Object.assign(new Error("name must not exceed 150 characters"), {
        statusCode: 400,
      });
    }
  }

  // Phone number
  // เบอร์โทรต้องเป็นข้อความ เพื่อรักษาเลข 0 ด้านหน้า
  // ตอนแก้ไข ถ้าไม่ส่ง phone มา ให้ใช้ค่าเดิม
  if (input.phone !== undefined) {
    // ตรวจว่าเป็น string และห้ามว่าง
    if (typeof input.phone !== "string" || input.phone.trim() === "") {
      throw Object.assign(new Error("phone must be a non-empty string"), {
        statusCode: 400,
      });
    }

    // หลังตัดขีดและช่องว่าง ต้องเป็นมือถือ 10 หลัก
    const phone = normalizePhone(input.phone);

    // ความยาวต้องตรงกับฐานข้อมูล
    if (!/^0[689]\d{8}$/.test(phone)) {
      throw Object.assign(
        new Error(
          "phone must be a 10-digit Thai mobile number starting with 06, 08 or 09",
        ),
        { statusCode: 400 },
      );
    }
  }

  // ที่อยู่ไม่บังคับกรอก แต่ถ้ามีค่าต้องเป็นข้อความหรือ null
  if (
    input.address !== undefined &&
    input.address !== null &&
    typeof input.address !== "string"
  ) {
    throw Object.assign(new Error("address must be a string or null"), {
      statusCode: 400,
    });
  }

  // พิกัด lat lng
  if (
    input.lat !== undefined &&
    (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90)
  ) {
    throw Object.assign(new Error("latitude must be between -90 and 90"), {
      statusCode: 400,
    });
  }
  if (
    input.lng !== undefined &&
    (!Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180)
  ) {
    throw Object.assign(new Error("longitude must be between -180 and 180"), {
      statusCode: 400,
    });
  }
}

// ID จาก URL ต้องเป็นเลขจำนวนเต็มบวก เช่น "1" หรือ "42"
function validateCustomerId(id: string): void {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
    throw Object.assign(new Error("customer id must be a positive integer"), {
      statusCode: 400,
    });
  }
}

// แปลงข้อผิดพลาดเบอร์ซ้ำจากฐานข้อมูลเป็น HTTP 409
function handleCustomerWriteError(error: unknown): never {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  ) {
    throw Object.assign(
      new Error("Phone number is already used by another customer"),
      { statusCode: 409 },
    );
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

  static findNearby(
    lat: number,
    lng: number,
    radiusKm: number,
  ): Promise<CustomerWithDistance[]> {
    return CustomerModel.searchNearby(lat, lng, radiusKm);
  }

  static findById(id: string): Promise<Customer | null> {
    validateCustomerId(id);
    return CustomerModel.findById(id);
  }

  static async create(input: CustomerInput): Promise<Customer> {
    // check input first
    validate(input);

    const name = (input.name?.trim() || `${input.first_name ?? ''} ${input.last_name ?? ''}`).trim();
    const effectiveInput = { ...input, name };
    validate(effectiveInput);

    // การสร้างลูกค้าใหม่ต้องส่งข้อมูลจำเป็นให้ครบ
    if (
      !effectiveInput.name ||
      !effectiveInput.phone?.trim() ||
      effectiveInput.lat === undefined ||
      effectiveInput.lng === undefined
    ) {
      throw Object.assign(new Error("name, phone, lat and lng are required"), {
        statusCode: 400,
      });
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

  static async update(
    id: string,
    input: Partial<CustomerInput>,
  ): Promise<Customer | null> {
    validateCustomerId(id);
    validate(input);

    const name = input.name?.trim() || [input.first_name, input.last_name].filter(Boolean).join(' ').trim() || input.name;
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
    validateCustomerId(id);

    try {
      return await CustomerModel.delete(id);
    } catch (error) {
      // ฐานข้อมูลปฏิเสธการลบ เพราะมีข้อมูลอื่นอ้างอิงลูกค้านี้
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ER_ROW_IS_REFERENCED_2"
      ) {
        throw Object.assign(
          new Error("Cannot delete customer with existing orders"),
          { statusCode: 409 },
        );
      }

      // ข้อผิดพลาดอื่นส่งต่อ ไม่เหมารวมว่าเกิดจากออเดอร์
      throw error;
    }
  }
}
