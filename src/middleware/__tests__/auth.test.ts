import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../auth';

describe('account passwords', () => {
  it('stores owner and rider passwords as bcrypt cost 10 hashes', async () => {
    const hash = await hashPassword('a long test password');
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
    expect(await verifyPassword('a long test password', hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
    await expect(hashPassword('short')).rejects.toThrow();
  });
});
