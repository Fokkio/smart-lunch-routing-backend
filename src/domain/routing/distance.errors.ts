// ไฟล์นี้: error สำหรับพิกัดที่ไม่ถูกต้อง
/**
 * Domain error for invalid geographic coordinates.
 *
 * Thrown (never silently ignored) when a coordinate contains NaN,
 * non-finite values, or out-of-range latitude/longitude — so callers
 * can never mistake a meaningless `NaN km` for a real distance.
 */
// error สำหรับพิกัดที่ไม่ถูกต้อง พร้อมเหตุผลว่าผิดตรงไหน
export class InvalidCoordinateError extends Error {
  readonly reason: string;

// สร้าง error พิกัดไม่ถูกต้องพร้อมเหตุผล
  constructor(reason: string) {
    super(`Invalid coordinate: ${reason}`);
    this.name = 'InvalidCoordinateError';
    this.reason = reason;
  }
}
