// ไฟล์นี้: ดูว่า error ตอนรัน migration คือคอลัมน์ที่มีอยู่แล้วหรือไม่ จะได้ข้ามได้อย่างปลอดภัย
/**
 * Migration repeatability helper.
 *
 * `001` is idempotent (`CREATE TABLE IF NOT EXISTS`); `002` uses plain
 * `ADD COLUMN`, so re-running it raises MySQL `ER_DUP_FIELDNAME` for
 * columns that already exist. That specific error means "already applied"
 * and is safe to skip — every other error still aborts the migration.
 */
// ดูว่า error คือรหัส ER_DUP_FIELDNAME (คอลัมน์มีอยู่แล้ว) หรือไม่ ถ้าใช่แปลว่า migration นั้นรันไปแล้ว
export function isAlreadyAppliedError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ER_DUP_FIELDNAME'
  );
}
