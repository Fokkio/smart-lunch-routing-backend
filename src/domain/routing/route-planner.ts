import { CapacityRule } from '../delivery/capacity-rule';
import { haversineKm, round2 } from './distance-calculator';
import type {
  PlannedRoute,
  PlanningOrder,
  PlanningRider,
  RouteStop,
  RiderAssignment,
} from './route.types';

/**
 * Future route-optimization boundary.
 *
 * Eventually responsible for:
 * - receiving pending orders
 * - receiving available riders
 * - assigning orders to riders
 * - respecting rider capacity
 * - ordering delivery stops
 * - minimizing/optimizing routes
 *
 * Current first-pass behaviour (intentionally simple):
 * - Deterministic capacity-aware grouping: fill riders in order,
 *   at most MAX_ORDERS_PER_RIDER orders each (orders only — there is
 *   NO rider box-capacity rule).
 * - Within each rider group, order stops with a greedy
 *   nearest-neighbour walk starting from the shop.
 *
 * Why not a VRP/CVRP solver yet:
 * - Final routing requirements (optimality claims, road vs
 *   straight-line distance, deadline handling) are still open.
 *
 * TODO:
 * - Replace this placeholder heuristic with the final routing
 *   algorithm after delivery requirements are finalized.
 * - Decide input source of truth (shop coordinates per request vs
 *   server config) and deadline-risk handling.
 */

export interface PlanOptions {
  shop: { lat: number; lng: number };
}

export const DEFAULT_SHOP = { lat: 16.24631, lng: 103.25286 } as const;

export class RoutePlanner {
  static plan(
    orders: PlanningOrder[],
    riders: PlanningRider[],
    options: PlanOptions = { shop: { ...DEFAULT_SHOP } },
  ): PlannedRoute {
    if (orders.length === 0 || riders.length === 0) {
      return { assignments: [], totalDistanceKm: 0, unassignedOrderIds: orders.map((o) => o.id) };
    }

    // Deterministic grouping (stable input order): fill one rider at a time.
    const groups: PlanningOrder[][] = riders.map(() => []);
    const boxCounts: number[] = riders.map(() => 0);
    const unassignedOrderIds: string[] = [];
    let riderIndex = 0;

    for (const order of orders) {
      let placed = false;
      for (let attempt = 0; attempt < riders.length; attempt++) {
        const idx = (riderIndex + attempt) % riders.length;
        const group = groups[idx]!;
        if (
          CapacityRule.canAddOrder(group.length)
        ) {
          group.push(order);
          riderIndex = (idx + 1) % riders.length;
          placed = true;
          break;
        }
      }
      if (!placed) unassignedOrderIds.push(order.id);
    }

    const assignments: RiderAssignment[] = [];
    let totalDistanceKm = 0;

    groups.forEach((group, i) => {
      if (group.length === 0) return;
      const stops = RoutePlanner.orderStopsNearestNeighbour(group, options.shop);
      const distanceKm = round2(
        stops.reduce((sum, s) => sum + s.distanceFromPreviousKm, 0),
      );
      totalDistanceKm = round2(totalDistanceKm + distanceKm);
      assignments.push({
        riderId: riders[i]!.id,
        stops,
        totalBoxes: group.reduce((sum, o) => sum + o.boxes, 0),
        distanceKm,
      });
    });

    return { assignments, totalDistanceKm, unassignedOrderIds };
  }

  private static orderStopsNearestNeighbour(
    group: PlanningOrder[],
    shop: { lat: number; lng: number },
  ): RouteStop[] {
    const remaining = [...group];
    const stops: RouteStop[] = [];
    let current = { ...shop };
    let sequence = 1;
    while (remaining.length > 0) {
      remaining.sort(
        (a, b) => haversineKm(current, a) - haversineKm(current, b),
      );
      const next = remaining.shift()!;
      const leg = haversineKm(current, next);
      stops.push({
        orderId: next.id,
        customerId: next.customerId,
        sequence: sequence++,
        distanceFromPreviousKm: round2(leg),
      });
      current = { lat: next.lat, lng: next.lng };
    }
    return stops;
  }
}


