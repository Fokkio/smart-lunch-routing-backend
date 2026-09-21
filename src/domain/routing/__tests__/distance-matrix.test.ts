import { describe, expect, it } from 'vitest';
import type { Coordinate } from '../coordinate';
import type {
  DistanceCalculator,
  DistanceResult,
  DistanceSource,
  MatrixPoint,
} from '../distance.types';
import { DistanceMatrixBuilder } from '../distance-matrix';
import { HaversineDistanceCalculator } from '../haversine-distance-calculator';

/**
 * Deterministic fake provider: returns scripted per-pair distances so the
 * matrix builder is tested independently of Haversine details.
 */
function fakeCalculator(
  legs: Record<string, number>,
  source: DistanceSource = 'ROAD',
): DistanceCalculator & { calls: Array<[string, string]> } {
  const calls: Array<[string, string]> = [];
  return {
    source,
    calls,
    async calculate(from: Coordinate, to: Coordinate): Promise<DistanceResult> {
      calls.push([`${from.latitude},${from.longitude}`, `${to.latitude},${to.longitude}`]);
      const key = `${from.latitude},${from.longitude}->${to.latitude},${to.longitude}`;
      if (!(key in legs)) throw new Error(`unstubbed leg ${key}`);
      return { distanceKm: legs[key]!, source };
    },
  };
}

const coord = (latitude: number, longitude: number): Coordinate => ({
  latitude,
  longitude,
});

describe('DistanceMatrixBuilder', () => {
  it('builds a symmetric matrix in input point order with zero diagonal', async () => {
    const points: MatrixPoint[] = [
      { id: 'SHOP', coordinate: coord(0, 0) },
      { id: 'A', coordinate: coord(0, 1) },
      { id: 'B', coordinate: coord(1, 0) },
    ];
    const calc = fakeCalculator({
      '0,0->0,1': 1.0,
      '0,1->0,0': 1.0,
      '0,0->1,0': 2.0,
      '1,0->0,0': 2.0,
      '0,1->1,0': 0.5,
      '1,0->0,1': 0.5,
    });

    const matrix = await DistanceMatrixBuilder.build(points, calc);

    expect(matrix.pointIds).toEqual(['SHOP', 'A', 'B']);
    expect(matrix.distancesKm).toEqual([
      [0, 1.0, 2.0],
      [1.0, 0, 0.5],
      [2.0, 0.5, 0],
    ]);
    expect(matrix.source).toBe('ROAD');
  });

  it('preserves asymmetric provider distances without forcing symmetry', async () => {
    // Future OSRM case: A→B (1.0) differs from B→A (1.5, e.g. one-way road).
    const points: MatrixPoint[] = [
      { id: 'A', coordinate: coord(0, 0) },
      { id: 'B', coordinate: coord(0, 1) },
    ];
    const calc = fakeCalculator({
      '0,0->0,1': 1.0,
      '0,1->0,0': 1.5,
    });

    const matrix = await DistanceMatrixBuilder.build(points, calc);

    expect(matrix.distancesKm[0]![1]).toBe(1.0);
    expect(matrix.distancesKm[1]![0]).toBe(1.5);
  });

  it('returns a valid empty matrix for no points', async () => {
    const calc = fakeCalculator({});
    const matrix = await DistanceMatrixBuilder.build([], calc);
    expect(matrix).toEqual({ pointIds: [], distancesKm: [], source: 'ROAD' });
    expect(calc.calls).toHaveLength(0);
  });

  it('returns [[0]] for a single point without calling the provider', async () => {
    const calc = fakeCalculator({});
    const matrix = await DistanceMatrixBuilder.build(
      [{ id: 'SHOP', coordinate: coord(16.24631, 103.25286) }],
      calc,
    );
    expect(matrix).toEqual({ pointIds: ['SHOP'], distancesKm: [[0]], source: 'ROAD' });
    expect(calc.calls).toHaveLength(0);
  });

  it('builds a symmetric Haversine-backed matrix with zero diagonal', async () => {
    const points: MatrixPoint[] = [
      { id: 'SHOP', coordinate: coord(16.24631, 103.25286) },
      { id: 'A', coordinate: coord(16.24731, 103.25286) },
      { id: 'B', coordinate: coord(16.25, 103.26) },
    ];
    const matrix = await DistanceMatrixBuilder.build(
      points,
      new HaversineDistanceCalculator(),
    );

    expect(matrix.pointIds).toEqual(['SHOP', 'A', 'B']);
    expect(matrix.distancesKm).toHaveLength(3);
    for (const row of matrix.distancesKm) expect(row).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(matrix.distancesKm[i]![i]).toBe(0);
      for (let j = 0; j < 3; j++) {
        expect(matrix.distancesKm[j]![i]).toBeCloseTo(matrix.distancesKm[i]![j]!, 12);
        if (i !== j) expect(matrix.distancesKm[i]![j]).toBeGreaterThan(0);
      }
    }
    expect(matrix.source).toBe('HAVERSINE');
  });
});
