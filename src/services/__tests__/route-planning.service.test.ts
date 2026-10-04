import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoutePlanModel } from "../../models/route-plan.model";
import { RoutePlanningService } from "../route-planning.service";

// แทน model จริงด้วยฟังก์ชันจำลอง จึงไม่เรียกฐานข้อมูล
vi.mock("../../models/route-plan.model", () => ({
  RoutePlanModel: {
    deleteById: vi.fn(),
  },
}));

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
