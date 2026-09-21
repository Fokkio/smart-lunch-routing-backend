import { describe, expect, it } from 'vitest';
import type { TravelMatrix } from '../distance.types';
import { sequenceStops } from '../route-sequencer';

/**
 * Mock travel matrix builder for tests (durations hard-coded, never
 * produced by the sequencer under test).
 */
function travelMatrix(
  pointIds: string[],
  durations: number[][],
  distances?: number[][],
): TravelMatrix {
  return {
    pointIds,
    distancesKm: distances ?? durations.map((row) => row.slice()),
    durationsMinutes: durations,
    source: 'ROAD',
    approximate: false,
  };
}

describe('sequenceStops', () => {
  it('sequences a single stop trivially', () => {
    const matrix = travelMatrix(['SHOP', 'A'], [[0, 4], [4, 0]]);
    expect(sequenceStops('SHOP', ['A'], matrix)).toEqual({
      orderIds: ['A'],
      totalDistanceKm: 4,
      totalDurationMinutes: 4,
    });
  });

  it('picks the known-optimal 3-stop permutation from a mock matrix', () => {
    // Question: Shop→A=4, Shop→B=2, Shop→C=5, A→B=1, A→C=4,
    // B→A=1, B→C=1, C→A=2, C→B=1. Which order minimizes duration?
    // Independent hand evaluation of all 6 permutations:
    //   S-A-B-C = 4+1+1 = 6 | S-A-C-B = 4+4+1 = 9
    //   S-B-A-C = 2+1+4 = 7 | S-B-C-A = 2+1+2 = 5  <- winner
    //   S-C-A-B = 5+2+1 = 8 | S-C-B-A = 5+1+1 = 7
    // Answer: [B, C, A] with total 5.
    const ids = ['SHOP', 'A', 'B', 'C'];
    const legs = [
      [0, 4, 2, 5],
      [4, 0, 1, 4],
      [2, 1, 0, 1],
      [5, 2, 1, 0],
    ];
    const result = sequenceStops('SHOP', ['A', 'B', 'C'], travelMatrix(ids, legs));
    expect(result.orderIds).toEqual(['B', 'C', 'A']);
    expect(result.totalDurationMinutes).toBe(5);
    expect(result.totalDistanceKm).toBe(5);
  });

  it('respects asymmetric durations instead of assuming symmetry', () => {
    // A→B costs 10 but B→A costs 1: only [B, A] is optimal (2 vs 11).
    const ids = ['SHOP', 'A', 'B'];
    const durations = [
      [0, 1, 1],
      [1, 0, 10],
      [1, 1, 0],
    ];
    const result = sequenceStops('SHOP', ['A', 'B'], travelMatrix(ids, durations));
    expect(result.orderIds).toEqual(['B', 'A']);
    expect(result.totalDurationMinutes).toBe(2);
  });

  it('breaks equal-duration ties by shorter distance, then order id', () => {
    const ids = ['SHOP', 'A', 'B'];
    // Both orders take 3 min; A-first is shorter (3 km vs 5 km).
    const result = sequenceStops(
      'SHOP',
      ['A', 'B'],
      travelMatrix(ids, [[0, 2, 1], [0, 0, 1], [0, 2, 0]], [[0, 2, 4], [0, 0, 1], [0, 1, 0]]),
    );
    expect(result.orderIds).toEqual(['A', 'B']);
  });

  it('breaks full ties lexicographically for determinism', () => {
    const ids = ['SHOP', 'A', 'B'];
    const ones = [[0, 1, 1], [1, 0, 1], [1, 1, 0]];
    const result = sequenceStops('SHOP', ['B', 'A'], travelMatrix(ids, ones));
    expect(result.orderIds).toEqual(['A', 'B']);
  });

  it('rejects empty and oversized stop lists', () => {
    const matrix = travelMatrix(['SHOP', 'A'], [[0, 1], [1, 0]]);
    expect(() => sequenceStops('SHOP', [], matrix)).toThrow();
    expect(() => sequenceStops('SHOP', ['A', 'B', 'C', 'D'], matrix)).toThrow();
  });
});
