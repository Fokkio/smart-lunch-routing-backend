import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerModel } from "../../models/customer.model";
import { CustomerService } from "../customer.service";

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
