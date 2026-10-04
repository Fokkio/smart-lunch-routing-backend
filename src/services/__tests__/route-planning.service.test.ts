import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoutePlanModel } from "../../models/route-plan.model";
import { OrderModel } from "../../models/order.model";
import { CustomerModel } from "../../models/customer.model";
import { RiderModel } from "../../models/rider.model";
import { ShopSettingsModel } from "../../models/shop-settings.model";
import { RoutePlanningService } from "../route-planning.service";

// แทน model จริงด้วยฟังก์ชันจำลอง จึงไม่เรียกฐานข้อมูล
vi.mock("../../models/route-plan.model", () => ({
  RoutePlanModel: {
    deleteById: vi.fn(),
  },
}));
vi.mock("../../models/order.model", () => ({ OrderModel: { findAll: vi.fn() } }));
vi.mock("../../models/customer.model", () => ({ CustomerModel: { findById: vi.fn() } }));
vi.mock("../../models/rider.model", () => ({ RiderModel: { findAvailable: vi.fn() } }));
vi.mock("../../models/shop-settings.model", () => ({ ShopSettingsModel: { get: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RoutePlanningService.delete", () => {
  it("returns true when the plan exists and is removed", async () => {
    vi.mocked(RoutePlanModel.deleteById).mockResolvedValue(true);
    await expect(RoutePlanningService.delete(11889392)).resolves.toBe(true);
    expect(RoutePlanModel.deleteById).toHaveBeenCalledWith(11889392);
  });

  it("returns false when the plan does not exist", async () => {
    vi.mocked(RoutePlanModel.deleteById).mockResolvedValue(false);
    await expect(RoutePlanningService.delete(999)).resolves.toBe(false);
  });
});

describe("RoutePlanningService.generate rider capacity", () => {
  it("rejects four orders when only one rider is available", async () => {
    vi.mocked(ShopSettingsModel.get).mockResolvedValue({
      latitude: 16.2, longitude: 103.2, maxOrdersPerRider: 3,
    } as never);
    vi.mocked(OrderModel.findAll).mockResolvedValue([1, 2, 3, 4].map(id => ({
      id, customerId: id, boxes: 1, status: 'PENDING', orderDate: '2026-10-04', isSimulated: true,
    })));
    vi.mocked(CustomerModel.findById).mockImplementation(async id => ({
      id: Number(id), name: `Customer ${id}`, phone: '', address: '', lat: 16.2, lng: 103.2,
    }) as never);
    vi.mocked(RiderModel.findAvailable).mockResolvedValue([{
      id: 1, name: 'Rider', phone: null, isAvailable: true,
    }]);

    await expect(RoutePlanningService.generate('2026-10-04'))
      .rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining('at least 2') });
  });
});
