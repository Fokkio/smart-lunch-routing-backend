import { describe, expect, it } from 'vitest';
import { PlanConflictError } from '../route-plan.model';

/**
 * Offline-coverable part of the select-transaction guard: the conflict
 * error maps to HTTP 409 via the central error handler (which honours
 * `err.statusCode`). Row locking / rollback behaviour itself requires a
 * live database and is therefore reported, not unit-tested here.
 */
describe('PlanConflictError', () => {
  it('carries HTTP 409 for a competing SELECTED plan', () => {
    const error = new PlanConflictError('RoutePlan 1 is already SELECTED for 2026-09-20');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PlanConflictError');
    expect(error.statusCode).toBe(409);
    expect(error.message).toContain('already SELECTED');
  });
});
