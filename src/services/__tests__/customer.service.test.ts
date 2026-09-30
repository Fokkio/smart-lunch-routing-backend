import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerModel } from "../../models/customer.model";
import { CustomerService } from "../customer.service";
import { CustomerInput } from "../../models/customer.model";

// แทน model จริงด้วยฟังก์ชันจำลอง จึงไม่เรียกฐานข้อมูล
vi.mock("../../models/customer.model", () => ({
  CustomerModel: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(),
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
describe("Customer field types", () => {
  // จำลองข้อมูลผิดชนิดที่อาจส่งมาทาง HTTP
  const invalidFields = [
    { name: 123 },
    { name: null },
    { phone: 123 },
    { phone: null },
  ];

  it.each(invalidFields)(
    "rejects invalid field types on create: %j",
    async (invalidField) => {
      const input = {
        name: "ลูกค้าทดสอบ",
        phone: "0812345678",
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
    "rejects invalid field types on update: %j",
    async (invalidField) => {
      const input = invalidField as unknown as Partial<CustomerInput>;

      await expect(
        Promise.resolve().then(() => CustomerService.update("1", input)),
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(CustomerModel.update).not.toHaveBeenCalled();
    },
  );
});

// Describe 4
// ตรวจว่าข้อมูลที่ส่งเข้ามาต้องเป็น object ก่อนอ่าน field ภายใน
// เพื่อป้องกัน runtime error จาก null, undefined หรือข้อมูลผิดรูปแบบ
describe("Customer input structure", () => {
  const invalidInputs = [null, undefined, "hello", 123, []];

  it.each(invalidInputs)(
    "rejects invalid input before accessing fields: %j",
    async (value) => {
      const input = value as unknown as CustomerInput;

      await expect(
        Promise.resolve().then(() => CustomerService.create(input)),
      ).rejects.toMatchObject({ statusCode: 400 });

      await expect(
        Promise.resolve().then(() => CustomerService.update("1", input)),
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(CustomerModel.create).not.toHaveBeenCalled();
      expect(CustomerModel.update).not.toHaveBeenCalled();
    },
  );
});

//describe 5 test ความยาวตรงกันกับ Database
describe("Customer field lengths", () => {
  it.each([{ name: "ก".repeat(151) }, { phone: "0".repeat(21) }])(
    "rejects fields exceeding database limits: %j",
    async (fields) => {
      const input = {
        name: "ลูกค้าทดสอบ",
        phone: "0812345678",
        lat: 16.2469,
        lng: 103.2531,
        ...fields,
      };

      await expect(
        Promise.resolve().then(() => CustomerService.create(input)),
      ).rejects.toMatchObject({ statusCode: 400 });

      await expect(
        Promise.resolve().then(() => CustomerService.update("1", fields)),
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(CustomerModel.create).not.toHaveBeenCalled();
      expect(CustomerModel.update).not.toHaveBeenCalled();
    },
  );
});

// describe 6 ADDRESS VALIDATION
describe("Customer address validation", () => {
  it.each([123, {}, []])("rejects an invalid address: %j", async (address) => {
    const input = {
      name: "ลูกค้าทดสอบ",
      phone: "0812345678",
      lat: 16.2469,
      lng: 103.2531,
      address,
    } as unknown as CustomerInput;

    await expect(
      Promise.resolve().then(() => CustomerService.create(input)),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      Promise.resolve().then(() => CustomerService.update("1", input)),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(CustomerModel.create).not.toHaveBeenCalled();
    expect(CustomerModel.update).not.toHaveBeenCalled();
  });
});

// describe 6 Delete
describe("Customer deletion", () => {
  it("reports a conflict when orders reference the customer", async () => {
    // จำลอง error ที่ model ได้จากฐานข้อมูล
    vi.mocked(CustomerModel.delete).mockRejectedValueOnce({
      code: "ER_ROW_IS_REFERENCED_2",
    });

    await expect(CustomerService.delete("1")).rejects.toMatchObject({
      statusCode: 409,
      message: "Cannot delete customer with existing orders",
    });
  });

  it("preserves unrelated database errors", async () => {
    const databaseError = new Error("Connection failed");

    vi.mocked(CustomerModel.delete).mockRejectedValueOnce(databaseError);

    await expect(CustomerService.delete("1")).rejects.toBe(databaseError);
  });

  // DESCRIBE 7 -> customer ID VALIDATE
  describe("Customer ID validation", () => {
    it.each(["abc", "0", "-1", "1.5", "1e2", "9007199254740992"])(
      "rejects invalid ID %s before accessing the database",
      async (id) => {
        await expect(
          Promise.resolve().then(() => CustomerService.findById(id)),
        ).rejects.toMatchObject({ statusCode: 400 });

        await expect(
          Promise.resolve().then(() =>
            CustomerService.update(id, { name: "ชื่อใหม่" }),
          ),
        ).rejects.toMatchObject({ statusCode: 400 });

        await expect(CustomerService.delete(id)).rejects.toMatchObject({
          statusCode: 400,
        });

        expect(CustomerModel.findById).not.toHaveBeenCalled();
        expect(CustomerModel.update).not.toHaveBeenCalled();
        expect(CustomerModel.delete).not.toHaveBeenCalled();
      },
    );
  });

  // Describe 8 พิกัด lat lng
  describe("Customer coordinates", () => {
    it.each([
      { lat: 91 },
      { lat: -91 },
      { lng: 181 },
      { lng: -181 },
      { lat: "16.2469" },
      { lng: null },
    ])("rejects invalid coordinates: %j", async (coordinates) => {
      const input = {
        name: "ลูกค้าทดสอบ",
        phone: "0800000000",
        lat: 16.2469,
        lng: 103.2531,
        ...coordinates,
      } as unknown as CustomerInput;

      await expect(
        Promise.resolve().then(() => CustomerService.create(input)),
      ).rejects.toMatchObject({ statusCode: 400 });

      await expect(
        Promise.resolve().then(() => CustomerService.update("1", input)),
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(CustomerModel.create).not.toHaveBeenCalled();
      expect(CustomerModel.update).not.toHaveBeenCalled();
    });

    it("accepts zero coordinates", async () => {
      const input = {
        name: "ลูกค้าทดสอบ",
        phone: "0800000000",
        lat: 0,
        lng: 0,
      };

      vi.mocked(CustomerModel.create).mockResolvedValueOnce({
        ...input,
        id: 1,
        address: null,
      });

      await CustomerService.create(input);

      expect(CustomerModel.create).toHaveBeenCalledWith(input);
    });
  });

  // DESCRIBE 9 format thai MB phone 
  describe("Thai mobile phone rules", () => {
    it.each([
      ["061-234-5678", "0612345678"],
      [" 081 234 5678 ", "0812345678"],
      ["0912345678", "0912345678"],
    ])("normalizes %s before saving", async (phone, expectedPhone) => {
      const input = {
        name: "ลูกค้าทดสอบ",
        phone,
        lat: 16.2469,
        lng: 103.2531,
      };

      const savedCustomer = {
        ...input,
        id: 1,
        address: null,
        phone: expectedPhone,
      };

      vi.mocked(CustomerModel.create).mockResolvedValueOnce(savedCustomer);
      vi.mocked(CustomerModel.update).mockResolvedValueOnce(savedCustomer);

      await CustomerService.create(input);
      await CustomerService.update("1", { phone });

      expect(CustomerModel.create).toHaveBeenCalledWith({
        ...input,
        phone: expectedPhone,
      });

      expect(CustomerModel.update).toHaveBeenCalledWith("1", {
        phone: expectedPhone,
      });

      // การจัดรูปแบบต้องไม่เปลี่ยนข้อมูลต้นฉบับ
      expect(input.phone).toBe(phone);
    });

    it.each([
      "abcdef",
      "0212345678",
      "081234567",
      "08123456789",
      "+66812345678",
      "081/234/5678",
    ])("rejects unsupported phone %s", async (phone) => {
      const input = {
        name: "ลูกค้าทดสอบ",
        phone,
        lat: 16.2469,
        lng: 103.2531,
      };

      await expect(
        Promise.resolve().then(() => CustomerService.create(input)),
      ).rejects.toMatchObject({ statusCode: 400 });

      await expect(
        Promise.resolve().then(() => CustomerService.update("1", { phone })),
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(CustomerModel.create).not.toHaveBeenCalled();
      expect(CustomerModel.update).not.toHaveBeenCalled();
    });
  });
});
