import express from 'express';
import type { Server } from 'node:http';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { getPool, withTransaction } from '../../database/mysql.connection';
import { hashPassword, verifyPassword, type Identity } from '../../middleware/auth';
import { errorHandler } from '../../middleware/error-handler';
import { authRoutes } from '../auth.routes';

vi.mock('../../database/mysql.connection', () => ({ withTransaction: vi.fn(), getPool: vi.fn() }));
const execute = vi.fn();
const sessionExecute = vi.fn();
const password = 'a long owner test password';
let hash: string;
let server: Server | undefined;

beforeAll(async () => {
  hash = await hashPassword(password);
});
beforeEach(() => {
  execute.mockReset().mockResolvedValue([{}]);
  sessionExecute
    .mockReset()
    .mockResolvedValue([[{ actor_type: 'OWNER', actor_id: 7, name: 'Owner' }]]);
  vi.mocked(getPool).mockReturnValue({ execute: sessionExecute } as never);
  vi.mocked(withTransaction)
    .mockReset()
    .mockImplementation(async (work) => work({ execute } as never));
});
afterEach(() => {
  server?.close();
});

async function account(
  method: 'GET' | 'PUT',
  body?: unknown,
  role: Identity['type'] | null = 'OWNER',
) {
  sessionExecute.mockResolvedValue(role ? [[{ actor_type: role, actor_id: 7, name: role }]] : [[]]);
  const app = express().use(express.json()).use('/auth', authRoutes).use(errorHandler);
  server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a local port');
  return fetch(`http://127.0.0.1:${address.port}/auth/owner-account`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(role ? { Authorization: `Bearer ${'A'.repeat(43)}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

it('returns only the authenticated owner username', async () => {
  sessionExecute
    .mockResolvedValueOnce([[{ actor_type: 'OWNER', actor_id: 7, name: 'Owner' }]])
    .mockResolvedValueOnce([[{ username: 'shop-owner', password_hash: 'must-not-leak' }]]);
  const response = await account('GET');
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ username: 'shop-owner' });
  expect(sessionExecute.mock.calls[1][1]).toEqual([7]);
  expect(sessionExecute.mock.calls[1][0]).not.toContain('password_hash');
});

it.each(['GET', 'PUT'] as const)('denies riders on %s', async (method) => {
  expect(
    (
      await account(
        method,
        method === 'PUT' ? { username: 'another', currentPassword: password } : undefined,
        'RIDER',
      )
    ).status,
  ).toBe(403);
  expect(withTransaction).not.toHaveBeenCalled();
  expect(sessionExecute).toHaveBeenCalledTimes(1);
});
it('requires an authenticated session', async () => {
  expect(
    (await account('PUT', { username: 'another', currentPassword: password }, null)).status,
  ).toBe(401);
  expect(withTransaction).not.toHaveBeenCalled();
  expect(sessionExecute).not.toHaveBeenCalled();
});

it.each([
  [],
  {},
  { username: 'new-owner' },
  { currentPassword: password },
  { username: '', currentPassword: password },
  { username: 'x'.repeat(101), currentPassword: password },
  { username: 'İ'.repeat(60), currentPassword: password },
  { username: 7, currentPassword: password },
  { newPassword: 7, currentPassword: password },
  { username: 'new-owner', currentPassword: 'x'.repeat(129) },
])('rejects invalid account input before opening a write transaction: %j', async (body) => {
  expect((await account('PUT', body)).status).toBe(400);
  expect(withTransaction).not.toHaveBeenCalled();
});

it('verifies the current password before changing credentials or revoking sessions', async () => {
  execute.mockResolvedValueOnce([[{ password_hash: hash }]]);
  const response = await account('PUT', {
    username: 'new-owner',
    currentPassword: 'incorrect password',
  });
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ message: 'Current password is incorrect' });
  expect(execute).toHaveBeenCalledTimes(1);
});

it.each(['short', 'ก'.repeat(25)])(
  'rejects a new password outside the existing bcrypt policy: %s',
  async (newPassword) => {
    execute.mockResolvedValueOnce([[{ password_hash: hash }]]);
    expect((await account('PUT', { currentPassword: password, newPassword })).status).toBe(400);
    expect(execute).toHaveBeenCalledTimes(1);
  },
);

it.each([
  { username: '  NEW.Owner  ' },
  { newPassword: 'a different owner password' },
  { username: 'NEW.Owner', newPassword: 'a different owner password' },
  { newPassword: 'ก'.repeat(24) },
])(
  'updates only requested fields of the current owner and revokes all owner sessions: %j',
  async (change) => {
    execute.mockResolvedValueOnce([[{ password_hash: hash }]]);
    const response = await account('PUT', { ...change, currentPassword: password, ownerId: 999 });
    expect(response.status).toBe(204);
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toContain("role='OWNER' AND is_active=TRUE FOR UPDATE");
    expect(execute.mock.calls[0][1]).toEqual([7]);
    const [username, newHash, id] = execute.mock.calls[1][1];
    expect(username).toBe('username' in change ? 'new.owner' : null);
    expect(id).toBe(7);
    if (typeof change.newPassword === 'string') {
      expect(newHash).toMatch(/^\$2[aby]\$10\$/);
      expect(await verifyPassword(change.newPassword, newHash)).toBe(true);
    } else expect(newHash).toBeNull();
    expect(execute.mock.calls[2][0]).toContain('DELETE FROM auth_sessions');
    expect(execute.mock.calls[2][1]).toEqual(['OWNER', 7]);
  },
);

it('returns a conflict on a duplicate username without revoking sessions', async () => {
  execute
    .mockResolvedValueOnce([[{ password_hash: hash }]])
    .mockRejectedValueOnce(Object.assign(new Error('Duplicate'), { code: 'ER_DUP_ENTRY' }));
  expect((await account('PUT', { username: 'existing', currentPassword: password })).status).toBe(
    409,
  );
  expect(execute).toHaveBeenCalledTimes(2);
});
