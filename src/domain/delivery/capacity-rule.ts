// ไฟล์นี้: กฎความจุ นับเป็นออเดอร์ ไม่ใช่กล่อง ไรเดอร์ 1 คนรับได้สูงสุด 3 ออเดอร์
// canAddOrder: ตรวจว่ากลุ่มนี้ยังรับออเดอร์เพิ่มได้ไหม (จำนวนปัจจุบัน + 1 ต้องไม่เกินขีดจำกัด)
/** Capacity is orders, never boxes. Each order independently has 1–3 boxes. */
export const MAX_ORDERS_PER_RIDER = 3;
// คลาสกฎความจุ: นับเป็นออเดอร์ ไม่ใช่กล่อง ไรเดอร์ 1 คนรับได้สูงสุด 3 ออเดอร์
export class CapacityRule { static canAddOrder(currentOrders: number, limit = MAX_ORDERS_PER_RIDER): boolean { return currentOrders + 1 <= limit; } }