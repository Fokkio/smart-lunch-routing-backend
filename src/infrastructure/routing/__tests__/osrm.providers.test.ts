import { describe, expect, it } from 'vitest';
import { OsrmClient } from '../osrm.client';
import { OsrmDistanceCalculator } from '../osrm-distance-calculator';
import { OsrmTableProvider } from '../osrm-matrix.provider';
import { OsrmRouteProvider } from '../osrm-route.provider';
import { RoutingError } from '../routing.errors';

const SHOP = { latitude: 16.24631, longitude: 103.25286 };
const STOP = { latitude: 16.25, longitude: 103.26 };

function clientFor(body: unknown) {
  return new OsrmClient(
    'https://osrm.test',
    1000,
    async () => ({ ok: true, status: 200, json: async () => body }),
  );
}

describe('OsrmDistanceCalculator', () => {
  it('returns road distance/duration with source ROAD', async () => {
    const calculator = new OsrmDistanceCalculator(
      clientFor({
        code: 'Ok',
        routes: [
          {
            distance: 1834.2,
            duration: 312.4,
            geometry: { type: 'LineString', coordinates: [] },
          },
        ],
      }),
    );
    const result = await calculator.calculate(SHOP, STOP);
    expect(result.distanceKm).toBeCloseTo(1.8342, 10);
    expect(result.durationMinutes).toBeCloseTo(5.2066666667, 8);
    expect(result.source).toBe('ROAD');
    expect(result.approximate).toBe(false);
  });
});

describe('OsrmTableProvider', () => {
  it('returns a typed ROAD matrix preserving asymmetry', async () => {
    const provider = new OsrmTableProvider(
      clientFor({
        code: 'Ok',
        distances: [[0, 1000], [1200, 0]],
        durations: [[0, 120], [150, 0]],
      }),
    );
    const matrix = await provider.fetchMatrix([
      { id: 'SHOP', coordinate: SHOP },
      { id: 'A', coordinate: STOP },
    ]);
    expect(matrix).toEqual({
      pointIds: ['SHOP', 'A'],
      distancesKm: [[0, 1.0], [1.2, 0]],
      durationsMinutes: [[0, 2.0], [2.5, 0]],
      source: 'ROAD',
      approximate: false,
    });
  });

  it('throws NO_ROUTE when a table cell is null', async () => {
    const provider = new OsrmTableProvider(
      clientFor({
        code: 'Ok',
        distances: [[0, null], [1200, 0]],
        durations: [[0, null], [150, 0]],
      }),
    );
    const error = await provider
      .fetchMatrix([
        { id: 'SHOP', coordinate: SHOP },
        { id: 'A', coordinate: STOP },
      ])
      .catch((e) => e);
    expect(error).toBeInstanceOf(RoutingError);
    expect(error.code).toBe('NO_ROUTE');
  });
});

describe('OsrmRouteProvider', () => {
  it('returns geometry in GeoJSON [longitude, latitude] order', async () => {
    const provider = new OsrmRouteProvider(
      clientFor({
        code: 'Ok',
        routes: [
          {
            distance: 2000,
            duration: 300,
            geometry: {
              type: 'LineString',
              coordinates: [[103.25286, 16.24631], [103.26, 16.25]],
            },
          },
        ],
      }),
    );
    const route = await provider.fetchRoute([SHOP, STOP]);
    expect(route.distanceKm).toBe(2);
    expect(route.durationMinutes).toBe(5);
    expect(route.geometry).toEqual({
      type: 'LineString',
      coordinates: [[103.25286, 16.24631], [103.26, 16.25]],
    });
    // First element is longitude (103.x), not latitude (16.x).
    expect(route.geometry!.coordinates[0]![0]).toBeGreaterThan(100);
    expect(route.approximate).toBe(false);
  });
});
