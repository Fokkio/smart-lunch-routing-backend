/**
 * Migration repeatability helper.
 *
 * `001` is idempotent (`CREATE TABLE IF NOT EXISTS`); `002` uses plain
 * `ADD COLUMN`, so re-running it raises MySQL `ER_DUP_FIELDNAME` for
 * columns that already exist. That specific error means "already applied"
 * and is safe to skip — every other error still aborts the migration.
 */
export function isAlreadyAppliedError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ER_DUP_FIELDNAME'
  );
}
