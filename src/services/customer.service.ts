import {
  CustomerModel,
  type Customer,
  type CustomerInput,
  type CustomerWithDistance,
} from "../models/customer.model";

function validate(input: Partial<CustomerInput>): void {
  // NAME
  if (input.name !== undefined) {
    if (typeof input.name !== "string" || input.name.trim() === "") {
      throw Object.assign(new Error("name must be a non-empty string"), {
        statusCode: 400,
      });
    }
  }

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

  static searchByName(query: string): Promise<Customer[]> {
    return CustomerModel.searchByName(query);
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

  static delete(id: string): Promise<boolean> {
    return CustomerModel.delete(id);
  }
}
