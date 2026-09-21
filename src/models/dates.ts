/**
 * Shared DATE serialization for model mappers (no DB storage change).
 *
 * mysql2 returns DATE columns as JS `Date` objects, so `String(date)`
 * yields `"Mon Sep 21 2026 ..."` — slicing that produces the misleading
 * `"Mon Sep 21"`. This helper always returns stable ISO `YYYY-MM-DD`,
 * built from local calendar components (never `toISOString`, which can
 * shift the day across timezones for midnight dates).
 */
export function toISODate(value: string | Date): string {
  if (value instanceof Date) {
    return formatLocal(value);
  }
  return String(value).slice(0, 10);
}

/** Today's calendar date in server-local time (never UTC-shifted). */
export function todayLocal(): string {
  return formatLocal(new Date());
}

function formatLocal(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
