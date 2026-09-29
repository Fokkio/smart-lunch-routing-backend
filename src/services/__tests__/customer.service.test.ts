import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerModel } from "../../models/customer.model";
import { CustomerService } from "../customer.service";
import { CustomerInput } from "../../models/customer.model";

// แทน model จริงด้วยฟังก์ชันจำลอง จึงไม่เรียกฐานข้อมูล
vi.mock("../../models/customer.model", () => ({
  CustomerModel: {
    create: vi.fn(),
    update: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});


// DEScribe customer name
describe("Customer name validation", () => {
  it("rejects a blank name when creating a customer", async () => {
    await expect(
      Promise.resolve().then(() =>
        CustomerService.create({
          name: "   ",
          phone: "0812345678",
          lat: 16.2469,
          lng: 103.2531,
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    // ข้อมูลผิดต้องหยุดก่อนถึงขั้นบันทึก
    expect(CustomerModel.create).not.toHaveBeenCalled();
  });

  it("rejects a blank name when updating a customer", async () => {
    await expect(
      Promise.resolve().then(() => CustomerService.update("1", { name: "" })),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(CustomerModel.update).not.toHaveBeenCalled();
  });

  it("passes valid customer data to the model", async () => {
    const input = {
      name: "ลูกค้าทดสอบ",
      phone: "0812345678",
      lat: 16.2469,
      lng: 103.2531,
    };

    const savedCustomer = {
      ...input,
      id: 1,
      address: null,
    };

    // กำหนดคำตอบจำลองของฐานข้อมูล
    vi.mocked(CustomerModel.create).mockResolvedValueOnce(savedCustomer);

    const result = await CustomerService.create(input);

    expect(CustomerModel.create).toHaveBeenCalledWith(input);
    expect(result).toEqual(savedCustomer);
  });
});


// describe customer phone 
describe("Customer phone validation", () => {
  it("rejects a blank phone when updating a customer", async () => {
    await expect(
      Promise.resolve().then(() =>
        CustomerService.update("1", { phone: "   " }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(CustomerModel.update).not.toHaveBeenCalled();
  });

  it("allows updating only the name without sending a phone", async () => {
    vi.mocked(CustomerModel.update).mockResolvedValueOnce({
      id: 1,
      name: "ชื่อใหม่",
      phone: "0812345678",
      address: null,
      lat: 16.2469,
      lng: 103.2531,
    });

    await CustomerService.update("1", { name: "ชื่อใหม่" });

    expect(CustomerModel.update).toHaveBeenCalledWith("1", {
      name: "ชื่อใหม่",
    });
  });
});

// DESCRIBE 3 กรณี ส่งตัวเลขหรือ null มาแทนชื่อ/เบอร์โทร
describe('Customer field types', () => {
  // จำลองข้อมูลผิดชนิดที่อาจส่งมาทาง HTTP
  const invalidFields = [
    { name: 123 },
    { name: null },
    { phone: 123 },
    { phone: null },
  ];

  it.each(invalidFields)(
    'rejects invalid field types on create: %j',
    async (invalidField) => {
      const input = {
        name: 'ลูกค้าทดสอบ',
        phone: '0812345678',
        lat: 16.2469,
        lng: 103.2531,
        ...invalidField,
      } as unknown as CustomerInput;

      await expect(
        Promise.resolve().then(() => CustomerService.create(input)),
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(CustomerModel.create).not.toHaveBeenCalled();
    },
  );

  it.each(invalidFields)(
    'rejects invalid field types on update: %j',
    async (invalidField) => {
      const input = invalidField as unknown as Partial<CustomerInput>;

      await expect(
        Promise.resolve().then(() => CustomerService.update('1', input)),
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(CustomerModel.update).not.toHaveBeenCalled();
    },
  );
});