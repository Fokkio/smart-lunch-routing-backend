import {
  CustomerModel,
  type Customer,
  type CustomerInput,
  type CustomerWithDistance,
} from "../models/customer.model";

function validate(input: Partial<CustomerInput>): void {
  // ต้องได้รับข้อมูลลูกค้าเป็น object ก่อน จึงอ่าน name/phone ได้ (ถ้าตรวจแค่ name เวลา null ทั้งก้อน ตอนอ่านจะพัง)
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw Object.assign(new Error("customer data must be an object"), {
      statusCode: 400,
    });
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

    // ความยาวต้องตรงกับฐานข้อมูล
    if (Array.from(input.phone).length > 20) {
      throw Object.assign(new Error("phone must not exceed 20 characters"), {
        statusCode: 400,
      });
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
    return CustomerModel.findById(id);
  }

  static create(input: CustomerInput): Promise<Customer> {
    // check input first
    validate(input);

    // การสร้างลูกค้าใหม่ต้องส่งข้อมูลจำเป็นให้ครบ
    if (
      !input.name?.trim() ||
      !input.phone?.trim() ||
      input.lat === undefined ||
      input.lng === undefined
    ) {
      throw Object.assign(new Error("name, phone, lat and lng are required"), {
        statusCode: 400,
      });
    }
    return CustomerModel.create(input);
  }

  static update(
    id: string,
    input: Partial<CustomerInput>,
  ): Promise<Customer | null> {
    validate(input);
    return CustomerModel.update(id, input);
  }

  // DELETE
  static async delete(id: string): Promise<boolean> {
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
