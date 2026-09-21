import { validateCoordinate, type Coordinate } from '../routing/coordinate';
import { haversineKmBetween } from '../routing/haversine-distance-calculator';
import { MAX_ORDERS_PER_RIDER } from './capacity-rule';

/**
 * Order grouping for rider assignment (pure domain, no HTTP/DB).
 *
 * Hard constraint: ONE rider/delivery job holds AT MOST `maxOrdersPerRider`
 * orders (default 3). Box counts NEVER influence grouping — an order with
 * 3 boxes and an order with 1 box each occupy one slot.
 *
 * Heuristic (deterministic, explainable, fits 20–30 orders):
 * 1. `riderCount` seeds are picked by farthest-point sampling from the
 *    shop (seed 1 = farthest order from shop; each next seed = the order
 *    maximizing its minimum Haversine distance to the existing seeds).
 * 2. Remaining orders are assigned one by one to the nearest seed cluster
 *    that still has a free slot (≤ max orders); ties break by order id.
 *
 * `seedOffset` rotates the seed ranking to produce a deterministic
 * alternative grouping for "recalculate" (a NEW plan, never a mutation).
 */
export interface ClusterOrder {
  id: string;
  coordinate: Coordinate;
}

/** Minimum riders so every order fits: `ceil(n / maxOrdersPerRider)`. */
export function minimumRiderCount(orderCount: number, maxOrdersPerRider = MAX_ORDERS_PER_RIDER): number {
  if (!Number.isInteger(orderCount) || orderCount < 0) {
    throw new Error(`orderCount must be a non-negative integer, got ${orderCount}`);
  }
  if (!Number.isInteger(maxOrdersPerRider) || maxOrdersPerRider < 1) {
    throw new Error(`maxOrdersPerRider must be a positive integer, got ${maxOrdersPerRider}`);
  }
  return Math.ceil(orderCount / maxOrdersPerRider);
}

/** Group order ids into `riderCount` clusters of at most `maxOrdersPerRider`. */
export function clusterOrders(
  orders: ClusterOrder[],
  shop: Coordinate,
  riderCount: number,
  options: { maxOrdersPerRider?: number; seedOffset?: number } = {},
): string[][] {
  const maxOrdersPerRider = options.maxOrdersPerRider ?? MAX_ORDERS_PER_RIDER;
  const seedOffset = options.seedOffset ?? 0;
  validateCoordinate(shop);
  for (const order of orders) validateCoordinate(order.coordinate);

  if (!Number.isInteger(riderCount) || riderCount < 0) {
    throw new Error(`riderCount must be a non-negative integer, got ${riderCount}`);
  }
  if (orders.length === 0) return [];
  if (riderCount === 0) {
    throw new Error(`riderCount 0 cannot hold ${orders.length} order(s)`);
  }
  if (riderCount * maxOrdersPerRider < orders.length) {
    throw new Error(
      `riderCount ${riderCount} × max ${maxOrdersPerRider} cannot hold ${orders.length} orders`,
    );
  }

  const ranked = [...orders].sort(
    (a, b) =>
      haversineKmBetween(shop, b.coordinate) - haversineKmBetween(shop, a.coordinate) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const rotated = ranked.map((_, i) => ranked[(i + seedOffset) % ranked.length]!);

  // Farthest-point seeds over the (possibly rotated) ranking.
  const seeds: ClusterOrder[] = [rotated[0]!];
  const seeded = new Set([rotated[0]!.id]);
  while (seeds.length < riderCount) {
    let best: ClusterOrder | null = null;
    let bestScore = -1;
    for (const candidate of rotated) {
      if (seeded.has(candidate.id)) continue;
      const score = Math.min(
        ...seeds.map((seed) => haversineKmBetween(seed.coordinate, candidate.coordinate)),
      );
      if (score > bestScore || (score === bestScore && best !== null && candidate.id < best.id)) {
        best = candidate;
        bestScore = score;
      }
    }
    // Total capacity is sufficient, so a candidate always exists when riders remain.
    if (!best) break;
    seeds.push(best);
    seeded.add(best.id);
  }

  const clusters: ClusterOrder[][] = seeds.map((seed) => [seed]);
  for (const order of rotated) {
    if (seeded.has(order.id)) continue;
    let target: ClusterOrder[] | null = null;
    let targetDistance = Infinity;
    for (const cluster of clusters) {
      if (cluster.length >= maxOrdersPerRider) continue;
      const distance = haversineKmBetween(cluster[0]!.coordinate, order.coordinate);
      if (
        distance < targetDistance ||
        (distance === targetDistance && target !== null && cluster[0]!.id < target[0]!.id)
      ) {
        target = cluster;
        targetDistance = distance;
      }
    }
    // Reachable only if capacity suffices (checked above), so target exists.
    (target ?? clusters[0]!).push(order);
  }
  return clusters.map((cluster) => cluster.map((order) => order.id));
}
