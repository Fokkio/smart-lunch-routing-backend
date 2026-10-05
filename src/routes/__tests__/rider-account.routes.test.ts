import express from 'express';
import type { Server } from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { withTransaction } from '../../database/mysql.connection';
import { riderRoutes } from '../rider.routes';

vi.mock('../../database/mysql.connection', () => ({ withTransaction: vi.fn(), getPool: vi.fn() }));

const execute = vi.fn();
let server: Server | undefined;

beforeEach(() => {
  execute.mockReset();
  vi.mocked(withTransaction).mockImplementation(async work => work({ execute } as never));
});
afterEach(() => server?.close());

async function putAccount(body: unknown): Promise<Response> {
  const app = express().use(express.json()).use('/riders', riderRoutes);
  server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a local port');
  return fetch(`http://127.0.0.1:${address.port}/riders/7/account`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

it('sets a unique username and bcrypt password and revokes rider sessions', async () => {
  execute.mockResolvedValueOnce([[{ password_hash: null }]])
    .mockResolvedValueOnce([{}]).mockResolvedValueOnce([{}]);
  const response = await putAccount({ username: 'Courier.Seven', password: 'a long test password' });
  expect(response.status).toBe(204);
  expect(execute.mock.calls[1]![1][0]).toBe('courier.seven');
  expect(execute.mock.calls[1]![1][1]).toMatch(/^\$2[aby]\$10\$/);
  expect(execute.mock.calls[2]![0]).toContain('DELETE FROM auth_sessions');
});

it('requires an initial password and rejects a username already in use', async () => {
  execute.mockResolvedValueOnce([[{ password_hash: null }]]);
  expect((await putAccount({ username: 'courier.seven' })).status).toBe(400);
  server?.close();
  execute.mockReset().mockResolvedValueOnce([[{ password_hash: 'old-hash' }]])
    .mockRejectedValueOnce(Object.assign(new Error('Duplicate'), { code: 'ER_DUP_ENTRY' }));
  expect((await putAccount({ username: 'courier.seven' })).status).toBe(409);
});
