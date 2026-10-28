// ไฟล์นี้: ตรวจและแปลงค่าจาก query/body สำหรับค้นหาใกล้ ๆ และสร้างออเดอร์จำลอง
import { validDate } from '../services/input-validation';

// ตรวจและแปลงค่า lat/lng/radius จาก query: ตัวเลขต้องอยู่ในช่วงที่ถูกต้อง ไม่งั้นโยน error 400
export function parseNearbyQuery(
  latValue: unknown,
  lngValue: unknown,
  radiusValue: unknown,
  defaultRadiusKm: number,
): { lat: number; lng: number; radiusKm: number } {
  if (typeof latValue !== 'string' || !latValue.trim() || typeof lngValue !== 'string' || !lngValue.trim() ||
      (radiusValue !== undefined && (typeof radiusValue !== 'string' || !radiusValue.trim()))) badRequest('Coordinates and radius must be numeric query strings');
  const lat = Number(latValue);
  const lng = Number(lngValue);
  const radiusKm = radiusValue === undefined ? defaultRadiusKm : Number(radiusValue);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) badRequest('lat must be between -90 and 90');
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) badRequest('lng must be between -180 and 180');
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
    badRequest('radiusKm must be a finite number greater than 0');
  }
  return { lat, lng, radiusKm };
}

// ตรวจคำขอสร้างออเดอร์จำลอง: จำนวนต้องเป็นจำนวนเต็ม 20-30 และวันที่ต้องเป็น YYYY-MM-DD
export function parseSimulationRequest(countValue: unknown, dateValue: unknown): { count: number; orderDate?: string } {
  const count = countValue === undefined ? 25 : Number(countValue);
  if (!Number.isInteger(count) || count < 20 || count > 30) {
    badRequest('count must be an integer between 20 and 30');
  }
  if (dateValue !== undefined && !validDate(dateValue)) {
    badRequest('orderDate must be YYYY-MM-DD');
  }
  return { count, orderDate: dateValue as string | undefined };
}

// โยน error 400 พร้อมข้อความที่ส่งมา (ใช้ภายในไฟล์นี้เท่านั้น)
function badRequest(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 400 });
}
