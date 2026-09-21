/**
 * Deadline validation (pure domain, second precision).
 *
 * Rule: every delivery job must satisfy
 *   `estimatedFinish <= deadline`
 * where `estimatedFinish = startTime + routeDuration`. Times come from
 * `shop_settings` (`delivery_start_time`, `delivery_deadline`) — never
 * duplicated as magic constants here; the demo fallbacks live in
 * `delivery-rule.ts` and are only used when settings are unavailable.
 *
 * Boundary: finishing exactly at the deadline is valid; one second later
 * is not. A plan with ANY late job is infeasible — lateness can never be
 * outweighed by a lower cost.
 */

/** Parse "HH:MM" or "HH:MM:SS" (also accepts a TIME column string) to seconds since midnight. */
export function timeToSeconds(time: string): number {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!match) throw new Error(`Invalid time "${time}" (expected HH:MM or HH:MM:SS)`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? '0');
  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new Error(`Invalid time "${time}" (out of range)`);
  }
  return hours * 3600 + minutes * 60 + seconds;
}

/** Format seconds since midnight as "HH:MM" (presentation boundary). */
export function secondsToHHMM(totalSeconds: number): string {
  const rounded = Math.floor(totalSeconds / 60) * 60;
  const hours = Math.floor(rounded / 3600) % 24;
  const minutes = Math.floor((rounded % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Job finish in seconds: start + duration (fractional minutes allowed). */
export function finishSeconds(startSeconds: number, durationMinutes: number): number {
  if (!Number.isFinite(durationMinutes) || durationMinutes < 0) {
    throw new Error(`durationMinutes must be a non-negative number, got ${durationMinutes}`);
  }
  return startSeconds + durationMinutes * 60;
}

/** A job is on time only when it finishes at or before the deadline. */
export function isOnTime(finishInSeconds: number, deadlineInSeconds: number): boolean {
  return finishInSeconds <= deadlineInSeconds;
}
