import { beforeEach, describe, expect, it, vi } from "vitest";
import { RiderModel } from "../../models/rider.model";
import { RiderService } from "../rider.service";

// แทน model จริงด้วยฟังก์ชันจำลอง จึงไม่เรียกฐานข้อมูล
vi.mock("../../models/rider.model", () => ({
  RiderModel: {
    delete: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RiderService.delete", () => {
  it("returns true when the rider exists and is removed", async () => {
    vi.mocked(RiderModel.delete).mockResolvedValue(true);
    await expect(RiderService.delete("60001")).resolves.toBe(true);
    expect(RiderModel.delete).toHaveBeenCalledWith("60001");
  });

  it("returns false when the rider does not exist", async () => {
    vi.mocked(RiderModel.delete).mockResolvedValue(false);
    await expect(RiderService.delete("99999")).resolves.toBe(false);
  });

  it("maps a referenced-rider FK error to HTTP 409 instead of leaking SQL", async () => {
    vi.mocked(RiderModel.delete).mockRejectedValue({ code: "ER_ROW_IS_REFERENCED_2" });
    await expect(RiderService.delete("60001")).rejects.toMatchObject({ statusCode: 409 });
  });
});
