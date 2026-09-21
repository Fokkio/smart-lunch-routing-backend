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

export class RoutingError extends Error {
  readonly code: RoutingErrorCode;
  readonly status?: number;

  constructor(code: RoutingErrorCode, message: string, status?: number) {
    super(`[OSRM ${code}] ${message}`);
    this.name = 'RoutingError';
    this.code = code;
    this.status = status;
  }
}
