import { describe, expect, it } from 'vitest';
import { OsrmClient, type FetchFn } from '../osrm.client';
import { RoutingError } from '../routing.errors';

const CLIENT = (fetchFn: FetchFn, timeoutMs = 1000) =>
  new OsrmClient('https://osrm.test', timeoutMs, fetchFn);

const okFetch = (body: unknown): FetchFn => async () => ({
  ok: true,
  status: 200,
  json: async () => body,
});

const VALID_ROUTE = {
  code: 'Ok',
  routes: [
    {
      distance: 1834.2,
      duration: 312.4,
      geometry: { type: 'LineString', coordinates: [[103.25, 16.24]] },
    },
  ],
};

const SHOP = { latitude: 16.24631, longitude: 103.25286 };
const STOP = { latitude: 16.25, longitude: 103.26 };

describe('OsrmClient route conversion', () => {
  it('converts metres/seconds to km/minutes with source ROAD semantics', async () => {
    const client = CLIENT(okFetch(VALID_ROUTE));
    const route = await client.getRoute([SHOP, STOP]);
    expect(route.distanceMetres).toBe(1834.2);
    expect(route.durationSeconds).toBe(312.4);
    // 1834.2 m -> 1.8342 km; 312.4 s -> 5.20666... min (no rounding here).
    expect(route.distanceMetres / 1000).toBeCloseTo(1.8342, 10);
    expect(route.durationSeconds / 60).toBeCloseTo(5.2066666667, 8);
    expect(route.geometry.type).toBe('LineString');
  });

  it('throws NO_ROUTE when OSRM answers NoRoute', async () => {
    const client = CLIENT(okFetch({ code: 'NoRoute', routes: [] }));
    await expect(client.getRoute([SHOP, STOP])).rejects.toMatchObject({
      name: 'RoutingError',
      code: 'NO_ROUTE',
    });
  });

  it('throws HTTP_ERROR on HTTP 500', async () => {
    const client = CLIENT(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const error = await client.getRoute([SHOP, STOP]).catch((e) => e);
    expect(error).toBeInstanceOf(RoutingError);
    expect(error.code).toBe('HTTP_ERROR');
    expect(error.status).toBe(500);
  });

  it('throws TIMEOUT when the request exceeds the timeout', async () => {
    // Realistic hanging fetch: rejects with AbortError when aborted,
    // exactly like global fetch does when the AbortController fires.
    const hanging: FetchFn = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const aborted = new Error('The operation was aborted.');
          aborted.name = 'AbortError';
          reject(aborted);
        });
      });
    const client = CLIENT(hanging, 20);
    await expect(client.getRoute([SHOP, STOP])).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it.each([
    ['empty routes', { code: 'Ok', routes: [] }],
    ['missing distance', { code: 'Ok', routes: [{ duration: 1, geometry: { type: 'LineString', coordinates: [] } }] }],
    ['missing duration', { code: 'Ok', routes: [{ distance: 1, geometry: { type: 'LineString', coordinates: [] } }] }],
    ['malformed envelope', { nope: true }],
    ['bad code', { code: 'InvalidQuery', routes: [] }],
  ])('throws MALFORMED_RESPONSE for %s', async (_label, body) => {
    const client = CLIENT(okFetch(body));
    await expect(client.getRoute([SHOP, STOP])).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  });
});

describe('OsrmClient table conversion', () => {
  const tableBody = {
    code: 'Ok',
    distances: [[0, 1000], [1200, 0]],
    durations: [[0, 120], [150, 0]],
  };

  it('parses an asymmetric table without mirroring values', async () => {
    const client = CLIENT(okFetch(tableBody));
    const table = await client.getTable([SHOP, STOP]);
    expect(table.distancesMetres[0]![1]).toBe(1000);
    expect(table.distancesMetres[1]![0]).toBe(1200);
    expect(table.durationsSeconds[0]![1]).toBe(120);
    expect(table.durationsSeconds[1]![0]).toBe(150);
  });

  it('keeps null cells for the provider to treat as NoRoute', async () => {
    const client = CLIENT(
      okFetch({ code: 'Ok', distances: [[0, null], [1200, 0]], durations: [[0, null], [150, 0]] }),
    );
    const table = await client.getTable([SHOP, STOP]);
    expect(table.distancesMetres[0]![1]).toBeNull();
  });

  it('throws MALFORMED_RESPONSE for a missing durations matrix', async () => {
    const client = CLIENT(okFetch({ code: 'Ok', distances: [[0, 1], [1, 0]] }));
    await expect(client.getTable([SHOP, STOP])).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  });
});
