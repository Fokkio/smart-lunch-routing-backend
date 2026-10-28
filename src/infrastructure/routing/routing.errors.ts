// ไฟล์นี้: error ของระบบเส้นทางพร้อมรหัส เช่น TIMEOUT, NO_ROUTE เพื่อให้ผู้เรียกตัดสินใจว่าจะลองใหม่หรือใช้ค่าประมาณ
/**
 * Meaningful routing errors (infrastructure layer).
 *
 * Every failure mode maps to an explicit code so callers can decide
 * between retry, Haversine fallback, or a user-facing error — `undefined`
 * values must never leak into arithmetic as silent `NaN`.
 */
export type RoutingErrorCode =
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'NO_ROUTE'
  | 'MALFORMED_RESPONSE';

// คลาส error ของระบบเส้นทาง: เก็บรหัส error (เช่น TIMEOUT, NO_ROUTE) และ HTTP status ถ้ามี
export class RoutingError extends Error {
  readonly code: RoutingErrorCode;
  readonly status?: number;

// สร้าง error ระบบเส้นทางพร้อมรหัสและข้อความ (ขึ้นต้นด้วย [OSRM รหัส])
  constructor(code: RoutingErrorCode, message: string, status?: number) {
    super(`[OSRM ${code}] ${message}`);
    this.name = 'RoutingError';
    this.code = code;
    this.status = status;
  }
}
