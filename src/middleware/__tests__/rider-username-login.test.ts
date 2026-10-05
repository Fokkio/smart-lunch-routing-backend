import { beforeEach, expect, it, vi } from 'vitest';
import { getPool, withTransaction } from '../../database/mysql.connection';
import { hashPassword, login, normalizeRiderUsername } from '../auth';

vi.mock('../../database/mysql.connection', () => ({ getPool: vi.fn(), withTransaction: vi.fn() }));

const execute = vi.fn();
const query = vi.fn().mockResolvedValue([{}]);

beforeEach(() => {
  execute.mockReset();
  vi.mocked(getPool).mockReturnValue({ execute, query } as never);
  vi.mocked(withTransaction).mockImplementation(async work => work({ execute } as never));
});

it('normalizes rider usernames and rejects numeric usernames for new accounts', () => {
  expect(normalizeRiderUsername(' Rider.One ')).toBe('rider.one');
  expect(normalizeRiderUsername('123')).toBeNull();
  expect(normalizeRiderUsername('bad name')).toBeNull();
});

it('authenticates a rider by username while retaining numeric ID login during rollout', async () => {
  const hash = await hashPassword('a long test password');
  const account = { id: 7, name: 'Rider Seven', password_hash: hash, enabled: 1 };
  for (const input of ['rider_7', '7']) {
    execute.mockReset()
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ failed_count: 0, blocked: 0, stale: 0 }]])
      .mockResolvedValueOnce([[account]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}]);
    const session = await login('RIDER', input, 'a long test password');
    expect(session.user).toEqual({ type: 'RIDER', id: 7, name: 'Rider Seven' });
    expect(execute.mock.calls[2]![0]).toContain(input === '7' ? 'WHERE rider_id=?' : 'WHERE username=?');
    expect(execute.mock.calls[2]![1]).toEqual([input === '7' ? 7 : 'rider_7']);
  }
});
