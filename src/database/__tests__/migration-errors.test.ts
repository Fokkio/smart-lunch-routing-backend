import { describe, expect, it } from 'vitest';
import { isAlreadyAppliedError } from '../migration-errors';

describe('isAlreadyAppliedError', () => {
  it('treats duplicate-column as already applied', () => {
    expect(isAlreadyAppliedError({ code: 'ER_DUP_FIELDNAME' })).toBe(true);
  });

  it('lets every other error abort the migration', () => {
    expect(isAlreadyAppliedError({ code: 'ER_ACCESS_DENIED_ERROR' })).toBe(false);
    expect(isAlreadyAppliedError(new Error('boom'))).toBe(false);
    expect(isAlreadyAppliedError(null)).toBe(false);
  });
});
