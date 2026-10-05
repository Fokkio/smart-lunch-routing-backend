import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderModel } from "../../models/order.model";
import { OrderService } from "../order.service";

// แทน model จริงด้วยฟังก์ชันจำลอง จึงไม่เรียกฐานข้อมูล
vi.mock("../../models/order.model", () => ({
  OrderModel: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteSimulated: vi.fn(),
    findById: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Order boxes validation on create", () => {
  it("rejects a missing boxes value instead of crashing at the DB layer", async () => {
    await expect(
      Promise.resolve().then(() =>
        OrderService.create({ customerId: 1 } as never),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    // ข้อมูลผิดต้องหยุดก่อนถึงขั้นบันทึก (กัน 500 bind parameter)
    expect(OrderModel.create).not.toHaveBeenCalled();
  });

  it("rejects boxes outside 1-3 when creating", async () => {
    for (const boxes of [0, 4]) {
      await expect(
        Promise.resolve().then(() =>
          OrderService.create({ customerId: 1, boxes }),
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(OrderModel.create).not.toHaveBeenCalled();
  });

  it("rejects a non-positive customerId when creating", async () => {
    await expect(
      Promise.resolve().then(() =>
        OrderService.create({ customerId: 0, boxes: 2 }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(OrderModel.create).not.toHaveBeenCalled();
  });

  it("passes valid order data to the model", async () => {
    const input = { customerId: 1, boxes: 2 };
    const savedOrder = { ...input, id: 1, status: "PENDING" };

    vi.mocked(OrderModel.create).mockResolvedValueOnce(savedOrder as never);

    const result = await OrderService.create(input);

    expect(OrderModel.create).toHaveBeenCalled();
    expect(result).toEqual(savedOrder);
  });
});

describe("Order delete conflict", () => {
  it("maps a referenced-row FK error to 409 instead of leaking SQL", async () => {
    vi.mocked(OrderModel.delete).mockRejectedValueOnce(
      Object.assign(new Error("Cannot delete or update a parent row"), {
        code: "ER_ROW_IS_REFERENCED_2",
      }),
    );

    await expect(OrderService.delete("1")).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe("Simulated order clear conflict", () => {
  it("returns 409 when a route plan still references simulated orders", async () => {
    vi.mocked(OrderModel.deleteSimulated).mockRejectedValueOnce(
      Object.assign(new Error('foreign key'), { code: 'ER_ROW_IS_REFERENCED_2' }),
    );
    await expect(OrderService.deleteSimulated([1])).rejects.toMatchObject({ statusCode: 409 });
  });
});
