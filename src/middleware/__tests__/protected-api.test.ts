import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../../app';

let server: Server | undefined;
afterEach(() => server?.close());

describe('protected API routes', () => {
  it('requires a session before owner data or rider jobs can be read', async () => {
    server = createApp().listen(0);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a local port');
    const base = `http://127.0.0.1:${address.port}`;
    for (const path of ['/api/customers', '/api/route-plans', '/api/settings', '/api/my-jobs?date=2026-10-04']) {
      const response = await fetch(base + path);
      expect(response.status).toBe(401);
    }
    expect((await fetch(base + '/api/health')).status).toBe(200);
  });
});
