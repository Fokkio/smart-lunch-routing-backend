import { validateCoordinate } from './coordinate';
import type {
  DistanceCalculator,
  DistanceMatrix,
  MatrixPoint,
} from './distance.types';

/**
 * Builds a pairwise distance matrix against any `DistanceCalculator`
 * (Haversine today, OSRM road provider later) — never against a concrete
 * implementation.
 *
 * Ordering: row/column `i` always belongs to `points[i]`; `pointIds`
 * preserves input order so the result is self-describing (no bare
 * `number[][]` without metadata).
 *
 * Symmetry: the builder calls the provider for EVERY ordered pair
 * (`i !== j`) and never mirrors values, so asymmetric road distances
 * (`A→B ≠ B→A`, e.g. one-way roads) survive. Diagonal cells are exactly
 * `0` without a provider call. A Haversine-specific fast path may skip
 * mirrored calls in the future, but the generic builder must not assume
 * symmetry.
 */
export class DistanceMatrixBuilder {
  static async build(
    points: MatrixPoint[],
    calculator: DistanceCalculator,
  ): Promise<DistanceMatrix> {
    for (const point of points) {
      validateCoordinate(point.coordinate);
    }

    const n = points.length;
    const distancesKm: number[][] = Array.from({ length: n }, () =>
      new Array<number>(n).fill(0),
    );

    const jobs: Promise<void>[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const row = distancesKm[i]!;
        const from = points[i]!.coordinate;
        const to = points[j]!.coordinate;
        jobs.push(
          calculator.calculate(from, to).then((result) => {
            row[j] = result.distanceKm;
          }),
        );
      }
    }
    await Promise.all(jobs);

    return {
      pointIds: points.map((point) => point.id),
      distancesKm,
      source: calculator.source,
    };
  }
}
