import { describe, expect, it, vi } from 'vitest';
import type { Coordinate } from '../../../domain/routing/coordinate';
import type { DistanceResult } from '../../../domain/routing/distance.types';
import { HaversineDistanceCalculator } from '../../../domain/routing/haversine-distance-calculator';
import {
  estimateDurationMinutesExact,
  FallbackDistanceCalculator,
  fetchRouteGeometrySafe,
  fetchTravelMatrixWithFallback,
} from '../fallback-routing';
import { OsrmRouteProvider } from '../osrm-route.provider';
import { OsrmClient } from '../osrm.client';
import { OsrmTableProvider } from '../osrm-matrix.provider';
import { RoutingError } from '../routing.errors';

const SHOP: Coordinate = { latitude: 16.24631, longitude: 103.25286 };
const STOP: Coordinate = { latitude: 16.25, longitude: 103.26 };
const SETTINGS = { riderSpeedKmh: 30 };

function failingPrimary(code: 'TIMEOUT' | 'NO_ROUTE' = 'TIMEOUT') {
  return {
    source: 'ROAD' as const,
    calculate: vi.fn(async (): Promise<DistanceResult> => {
      throw new RoutingError(code, 'boom');
    }),
  };
}

describe('FallbackDistanceCalculator', () => {
  it('returns the ROAD result when OSRM works', async () => {
    const road: DistanceResult = {
      distanceKm: 1.8342,
      durationMinutes: 5.2,
      source: 'ROAD',
      approximate: false,
    };
    const fallback = new FallbackDistanceCalculator(
      { source: 'ROAD', calculate: async () => road },
      SETTINGS,
    );
    const result = await fallback.calculate(SHOP, STOP);
    expect(result).toMatchObject({ distanceKm: 1.8342, source: 'ROAD', approximate: false });
    expect(result.fallbackReason).toBeUndefined();
  });

  it('falls back to Haversine on OSRM timeout with identifiable metadata', async () => {
    const fallback = new FallbackDistanceCalculator(failingPrimary('TIMEOUT'), SETTINGS);
    const result = await fallback.calculate(SHOP, STOP);
    const expectedKm = await new HaversineDistanceCalculator().calculate(SHOP, STOP);
    expect(result.source).toBe('HAVERSINE');
    expect(result.approximate).toBe(true);
    expect(result.fallbackReason).toBe('ROUTING_SERVICE_UNAVAILABLE');
    expect(result.distanceKm).toBeCloseTo(expectedKm.distanceKm, 12);
    // Fallback duration honours the injected 30 km/h shop speed.
    expect(result.durationMinutes).toBeCloseTo((result.distanceKm / 30) * 60, 12);
  });

  it('maps NO_ROUTE to a NO_ROUTE fallback reason', async () => {
    const fallback = new FallbackDistanceCalculator(failingPrimary('NO_ROUTE'), SETTINGS);
    const result = await fallback.calculate(SHOP, STOP);
    expect(result.fallbackReason).toBe('NO_ROUTE');
    expect(result.approximate).toBe(true);
  });

  it('estimates fallback duration from injected settings, not a hardcoded speed', () => {
    expect(estimateDurationMinutesExact(1.42, 30)).toBeCloseTo(2.84, 12);
    expect(estimateDurationMinutesExact(15, 60)).toBe(15);
  });
});

describe('fetchTravelMatrixWithFallback', () => {
  const points = [
    { id: 'SHOP', coordinate: SHOP },
    { id: 'A', coordinate: STOP },
  ];

  it('returns the ROAD matrix when the table provider works', async () => {
    const client = new OsrmClient('https://osrm.test', 1000, async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'Ok',
        distances: [[0, 1000], [1000, 0]],
        durations: [[0, 120], [120, 0]],
      }),
    }));
    const matrix = await fetchTravelMatrixWithFallback(points, {
      tableProvider: new OsrmTableProvider(client),
      settings: SETTINGS,
    });
    expect(matrix.source).toBe('ROAD');
    expect(matrix.approximate).toBe(false);
    expect(matrix.fallbackReason).toBeUndefined();
  });

  it('returns an approximate Haversine matrix when OSRM fails', async () => {
    const client = new OsrmClient('https://osrm.test', 1000, async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    }));
    const matrix = await fetchTravelMatrixWithFallback(points, {
      tableProvider: new OsrmTableProvider(client),
      settings: SETTINGS,
    });
    expect(matrix.source).toBe('HAVERSINE');
    expect(matrix.approximate).toBe(true);
    expect(matrix.fallbackReason).toBe('ROUTING_SERVICE_UNAVAILABLE');
    expect(matrix.distancesKm[0]![1]).toBeGreaterThan(0);
    expect(matrix.durationsMinutes[0]![1]).toBeCloseTo(
      (matrix.distancesKm[0]![1]! / 30) * 60,
      12,
    );
  });
});

describe('fetchRouteGeometrySafe', () => {
  it('returns null geometry when OSRM is unavailable', async () => {
    const client = new OsrmClient('https://osrm.test', 1000, async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    }));
    const result = await fetchRouteGeometrySafe([SHOP, STOP], new OsrmRouteProvider(client));
    expect(result.geometry).toBeNull();
    expect(result.approximate).toBe(true);
  });
});
