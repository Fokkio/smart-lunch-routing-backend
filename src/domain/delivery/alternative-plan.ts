import { clusterOrders, minimumRiderCount, type ClusterOrder } from './order-clusterer';
import { calculateCosts, type CostSettings } from './cost-calculator';
import { sequenceStops, type SequencedRoute } from '../routing/route-sequencer';
import type { Coordinate } from '../routing/coordinate';
import type { TravelMatrix } from '../routing/distance.types';
import { InfeasiblePlanError } from './route-plan-assembler';

export const routeSignature = (groups: string[][]): string => JSON.stringify(groups.map(group => JSON.stringify(group)).sort());

export function findAlternativeRoutes(input: {
  orders: ClusterOrder[]; boxes: Map<string, number>; shop: Coordinate; matrix: TravelMatrix;
  maxOrders: number; riderCount: number; availableMinutes: number; serviceMinutes: number;
  costs: CostSettings; excluded: string;
}): SequencedRoute[] {
  const seen = new Set<string>();
  let best: { routes: SequencedRoute[]; cost: number; finish: number; key: string } | null = null;
  // ponytail: bounded seed/move/swap search, not a global optimum; replace with a VRP solver if larger batches need it.
  const limit = 5000;
  const considerRoutes = (routes: SequencedRoute[]) => {
    if (seen.size >= limit) return;
    const key = routeSignature(routes.map(route => route.orderIds));
    if (seen.has(key)) return;
    seen.add(key);
    if (key === input.excluded) return;
    const finish = Math.max(...routes.map(route => route.totalDurationMinutes + route.orderIds.length * input.serviceMinutes));
    if (finish > input.availableMinutes) return;
    const jobs = routes.map(route => ({ distanceKm: route.totalDistanceKm, boxes: route.orderIds.reduce((sum, id) => sum + input.boxes.get(id)!, 0) }));
    const cost = calculateCosts(jobs.reduce((sum, job) => sum + job.boxes, 0), jobs, input.costs).totalDeliveryCost;
    if (!best || cost < best.cost || (cost === best.cost && (finish < best.finish || (finish === best.finish && key < best.key)))) best = { routes, cost, finish, key };
  };
  const consider = (groups: string[][]) => {
    if (seen.size >= limit || groups.some(group => !group.length || group.length > input.maxOrders)) return;
    const routes = groups.map(group => sequenceStops('SHOP', group, input.matrix));
    considerRoutes(routes);
    if (routeSignature(routes.map(route => route.orderIds)) === input.excluded) {
      // A single rider can still take a different visit order; do not mistake one grouping for one route.
      routes.forEach((route, index) => {
        if (route.orderIds.length < 2) return;
        const alternate = [...routes];
        alternate[index] = sequenceStops('SHOP', route.orderIds, input.matrix, route.orderIds);
        considerRoutes(alternate);
      });
    }
  };
  for (let count = minimumRiderCount(input.orders.length, input.maxOrders); count <= Math.min(input.riderCount, input.orders.length) && seen.size < limit; count++) {
    for (let seedOffset = 0; seedOffset < input.orders.length && seen.size < limit; seedOffset++) {
      const groups = clusterOrders(input.orders, input.shop, count, { maxOrdersPerRider: input.maxOrders, seedOffset });
      consider(groups);
      for (let a = 0; a < groups.length && seen.size < limit; a++) {
        for (let b = a + 1; b < groups.length && seen.size < limit; b++) {
          for (const id of groups[a]!) {
            for (const other of groups[b]!) {
              const swapped = groups.map(group => [...group]);
              swapped[a] = groups[a]!.map(value => value === id ? other : value);
              swapped[b] = groups[b]!.map(value => value === other ? id : value);
              consider(swapped);
            }
          }
          for (const [from, to] of [[a, b], [b, a]]) {
            if (groups[from!]!.length < 2 || groups[to!]!.length >= input.maxOrders) continue;
            for (const id of groups[from!]!) {
              const moved = groups.map(group => [...group]);
              moved[from!] = moved[from!]!.filter(value => value !== id);
              moved[to!]!.push(id);
              consider(moved);
            }
          }
        }
      }
    }
  }
  if (!best) throw new InfeasiblePlanError('No distinct feasible alternative found within the search; keep the current plan or change the round inputs');
  return (best as { routes: SequencedRoute[] }).routes;
}
