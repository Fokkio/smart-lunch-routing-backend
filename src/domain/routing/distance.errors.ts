/**
 * Domain error for invalid geographic coordinates.
 *
 * Thrown (never silently ignored) when a coordinate contains NaN,
 * non-finite values, or out-of-range latitude/longitude — so callers
 * can never mistake a meaningless `NaN km` for a real distance.
 */
export class InvalidCoordinateError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Invalid coordinate: ${reason}`);
    this.name = 'InvalidCoordinateError';
    this.reason = reason;
  }
}
