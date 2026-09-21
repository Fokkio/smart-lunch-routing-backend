import type {
  MatrixPoint,
  TravelMatrix,
} from '../../domain/routing/distance.types';
import { OsrmClient } from './osrm.client';
import { RoutingError } from './routing.errors';

/**
 * Road travel matrix via a single OSRM Table call (infrastructure).
 *
 * One HTTP request serves all N² pairs (required for 20–30 orders —
 * never N² individual route calls). Asymmetric values are preserved
 * as returned; a `null` cell means OSRM found no route for that pair.
 */
export class OsrmTableProvider {
  constructor(private readonly client: OsrmClient) {}

  async fetchMatrix(points: MatrixPoint[]): Promise<TravelMatrix> {
    const table = await this.client.getTable(points.map((p) => p.coordinate));
    const n = points.length;
    const distancesKm: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const durationsMinutes: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const metres = table.distancesMetres[i]![j];
        const seconds = table.durationsSeconds[i]![j];
        if (metres === null || metres === undefined || seconds === null || seconds === undefined) {
          throw new RoutingError(
            'NO_ROUTE',
            `OSRM table has no route from ${points[i]!.id} to ${points[j]!.id}`,
          );
        }
        distancesKm[i]![j] = metres / 1000;
        durationsMinutes[i]![j] = seconds / 60;
      }
    }
    return {
      pointIds: points.map((p) => p.id),
      distancesKm,
      durationsMinutes,
      source: 'ROAD',
      approximate: false,
    };
  }
}
