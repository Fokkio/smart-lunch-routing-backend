import { describe, expect, it } from 'vitest';
import { validateCoordinate, type Coordinate } from '../coordinate';
import { InvalidCoordinateError } from '../distance.errors';
import {
  EARTH_MEAN_RADIUS_KM,
  HaversineDistanceCalculator,
} from '../haversine-distance-calculator';
import { KNOWN_ANSWER_CASES } from './distance-known-answers.fixture';

const calculator = new HaversineDistanceCalculator();

describe('HaversineDistanceCalculator', () => {
  it('uses the documented Earth mean radius of 6371.0088 km', () => {
    expect(EARTH_MEAN_RADIUS_KM).toBe(6371.0088);
  });

  it.each(KNOWN_ANSWER_CASES)(
    'calculates known distance: $description (expected $expectedDistanceKm km)',
    async ({ from, to, expectedDistanceKm, toleranceKm }) => {
      const result = await calculator.calculate(from, to);
      expect(result.source).toBe('HAVERSINE');
      // Haversine yields straight-line distance only — never road duration.
      expect(result.durationMinutes).toBeUndefined();
      expect(Math.abs(result.distanceKm - expectedDistanceKm)).toBeLessThanOrEqual(
        toleranceKm,
      );
    },
  );

  it('returns exactly zero distance for identical coordinates', async () => {
    const point: Coordinate = { latitude: 16.24631, longitude: 103.25286 };
    const result = await calculator.calculate(point, { ...point });
    expect(result.distanceKm).toBe(0);
  });

  it.each([
    [{ latitude: 16.24631, longitude: 103.25286 }, { latitude: 16.25, longitude: 103.26 }],
    [{ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 1 }],
    [{ latitude: -33.8688, longitude: 151.2093 }, { latitude: 35.6762, longitude: 139.6503 }],
  ])('is symmetric: distance(A, B) equals distance(B, A)', async (a: Coordinate, b: Coordinate) => {
    const forward = await calculator.calculate(a, b);
    const backward = await calculator.calculate(b, a);
    expect(backward.distanceKm).toBeCloseTo(forward.distanceKm, 12);
  });

  it('returns non-negative distances for every valid pair', async () => {
    for (const { from, to } of KNOWN_ANSWER_CASES) {
      const result = await calculator.calculate(from, to);
      expect(result.distanceKm).toBeGreaterThanOrEqual(0);
    }
  });

  it.each([
    { latitude: 91, longitude: 0 },
    { latitude: -91, longitude: 0 },
    { latitude: 0, longitude: 181 },
    { latitude: 0, longitude: -181 },
    { latitude: Number.NaN, longitude: 0 },
    { latitude: 0, longitude: Number.NaN },
    { latitude: Number.POSITIVE_INFINITY, longitude: 0 },
    { latitude: 0, longitude: Number.NEGATIVE_INFINITY },
  ])('rejects invalid input %o with a meaningful validation error', async (bad: Coordinate) => {
    const good: Coordinate = { latitude: 16.24631, longitude: 103.25286 };
    await expect(calculator.calculate(bad, good)).rejects.toThrow(InvalidCoordinateError);
    await expect(calculator.calculate(good, bad)).rejects.toThrow(InvalidCoordinateError);
    // The shared validator is the single gate — covered directly too.
    expect(() => validateCoordinate(bad)).toThrow(InvalidCoordinateError);
  });

  it('accepts legal boundary coordinates', async () => {
    const result = await calculator.calculate(
      { latitude: -90, longitude: -180 },
      { latitude: 90, longitude: 180 },
    );
    expect(result.distanceKm).toBeGreaterThan(0);
  });
});
