import { describe, expect, it } from 'vitest';
import { MAX_ORDERS_PER_RIDER } from '../capacity-rule';
import { clusterOrders, minimumRiderCount, type ClusterOrder } from '../order-clusterer';

const SHOP = { latitude: 16.24631, longitude: 103.25286 };

/** Deterministic grid fixture around the shop (no randomness anywhere). */
function gridOrders(count: number): ClusterOrder[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ORD-${String(i + 1).padStart(2, '0')}`,
    coordinate: {
      latitude: SHOP.latitude + ((i * 7) % 13) * 0.001 - 0.006,
      longitude: SHOP.longitude + ((i * 11) % 17) * 0.001 - 0.008,
    },
  }));
}

function expectValidClustering(orders: ClusterOrder[], clusters: string[][], riderCount: number): void {
  const flat = clusters.flat();
  expect(flat).toHaveLength(orders.length);
  expect(new Set(flat).size).toBe(orders.length); // no duplicates
  for (const id of orders) expect(flat).toContain(id.id); // none lost
  for (const cluster of clusters) {
    expect(cluster.length).toBeGreaterThan(0);
    expect(cluster.length).toBeLessThanOrEqual(MAX_ORDERS_PER_RIDER);
  }
  expect(clusters.length).toBe(riderCount);
}

describe('minimumRiderCount', () => {
  it.each([
    [0, 0], [1, 1], [2, 1], [3, 1], [4, 2],
    [20, 7], [21, 7], [22, 8], [30, 10],
  ])('%i orders need %i rider(s)', (orders, riders) => {
    expect(minimumRiderCount(orders)).toBe(riders);
  });
});

describe('clusterOrders', () => {
  it.each([0, 1, 2, 3, 4, 20, 21, 22, 30])(
    'groups %i orders completely with at most 3 per rider',
    (count) => {
      const orders = gridOrders(count);
      const riders = minimumRiderCount(count);
      const clusters = clusterOrders(orders, SHOP, riders);
      expectValidClustering(orders, clusters, riders);
    },
  );

  it('rejects a rider count that cannot hold all orders', () => {
    expect(() => clusterOrders(gridOrders(4), SHOP, 1)).toThrow();
  });

  it('produces a deterministic alternative grouping with seedOffset', () => {
    const orders = gridOrders(9);
    const base = clusterOrders(orders, SHOP, 3);
    const alt = clusterOrders(orders, SHOP, 3, { seedOffset: 2 });
    expectValidClustering(orders, alt, 3);
    // A different seed must actually regroup (not silently return the same plan).
    expect(alt).not.toEqual(base);
  });

  it('is deterministic across repeated calls', () => {
    const orders = gridOrders(22);
    expect(clusterOrders(orders, SHOP, 8)).toEqual(clusterOrders(orders, SHOP, 8));
  });
});
