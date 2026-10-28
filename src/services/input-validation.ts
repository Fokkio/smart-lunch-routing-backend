// ไฟล์นี้: ตัวช่วยตรวจ input ทั่วไป ได้แก่ เป็น object ไหม id เป็นจำนวนเต็มบวกไหม และวันที่ถูกฟอร์แมตไหม
// โยน error 400 พร้อมข้อความที่ส่งมา
export function badInput(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 400 });
}
// ตรวจว่าข้อมูลที่ส่งมาเป็น object จริง (ไม่ใช่ null อาร์เรย์ หรือค่าอื่น)
export function validateObject(
  input: unknown,
  message = 'Data must be an object',
): asserts input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) badInput(message);
}
// ตรวจว่า id เป็นจำนวนเต็มบวก (ตัวเลขขึ้นต้นไม่ใช่ 0) ไม่งั้นโยน 400
export function validateId(id: string, message = 'ID must be a positive integer'): void {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) badInput(message);
}
// ตรวจว่าวันที่ที่ส่งมาเป็น YYYY-MM-DD ที่เป็นวันจริงหรือไม่
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
