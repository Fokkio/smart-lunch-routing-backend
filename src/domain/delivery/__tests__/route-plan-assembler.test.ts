import { describe, expect, it } from 'vitest';
import type { TravelMatrix } from '../../routing/distance.types';
import {
  assembleRoutePlan,
  InfeasiblePlanError,
  type AssembleInput,
} from '../route-plan-assembler';

/**
 * SIMULATED EXAM — full RoutePlan from a hard-coded matrix.
 *
 * Question: shop S, 4 pending orders (A:2 boxes, B:1, C:3, D:2),
 * start 11:30, deadline 12:30, settings 65/40/15/4, approximate
 * (HAVERSINE) matrix below. Clustering gives [D,C] and [A,B];
 * sequencing gives [C,D] and [B,A]. What is the RoutePlan?
 *
 * Matrix (durations == distances, symmetric):
 *   S→A4 S→B2 S→C6 S→D9 | A→B2 A→C5 A→D8 | B→C4 B→D7 | C→D3
 *
 * Independent hand-computed answer:
 *   job0 [C,D]: 6+3 = 9 km / 9 min, finish 11:39
 *   job1 [B,A]: 2+2 = 4 km / 4 min, finish 11:34
 *   riders 2, distance 13 km, finish 11:39 (feasible)
 *   boxes 8 → revenue 520, food 320
 *   delivery (15+4×9)=51 + (15+4×4)=31 = 82 → profit 118
 */
const SHOP = { latitude: 16.24631, longitude: 103.25286 };
const SETTINGS = { boxSalePrice: 65, boxFoodCost: 40, riderBaseCost: 15, riderCostPerKm: 4 };

const MATRIX: TravelMatrix = {
  pointIds: ['SHOP', '1', '2', '3', '4'],
  distancesKm: [
    [0, 4, 2, 6, 9],
    [4, 0, 2, 5, 8],
    [2, 2, 0, 4, 7],
    [6, 5, 4, 0, 3],
    [9, 8, 7, 3, 0],
  ],
  durationsMinutes: [
    [0, 4, 2, 6, 9],
    [4, 0, 2, 5, 8],
    [2, 2, 0, 4, 7],
    [6, 5, 4, 0, 3],
    [9, 8, 7, 3, 0],
  ],
  source: 'HAVERSINE',
  approximate: true,
  fallbackReason: 'ROUTING_SERVICE_UNAVAILABLE',
};

function examInput(overrides: Partial<AssembleInput> = {}): AssembleInput {
  return {
    planDate: '2026-09-20',
    shop: SHOP,
    startTime: '11:30:00',
    deadline: '12:30:00',
    orders: [
      { orderId: 1, customerId: 1, customerName: 'A', phone: '0801', address: null, latitude: 0, longitude: 0, boxCount: 2 },
      { orderId: 2, customerId: 2, customerName: 'B', phone: '0802', address: null, latitude: 0, longitude: 0, boxCount: 1 },
      { orderId: 3, customerId: 3, customerName: 'C', phone: '0803', address: null, latitude: 0, longitude: 0, boxCount: 3 },
      { orderId: 4, customerId: 4, customerName: 'D', phone: '0804', address: null, latitude: 0, longitude: 0, boxCount: 2 },
    ],
    jobs: [
      { orderIds: [3, 4], riderId: 1, geometry: null },
      { orderIds: [2, 1], riderId: 2, geometry: null },
    ],
    matrix: MATRIX,
    settings: SETTINGS,
    ...overrides,
  };
}

describe('assembleRoutePlan exam', () => {
  it('produces the known-answer RoutePlan', () => {
    const plan = assembleRoutePlan(examInput());
    expect(plan.riderCount).toBe(2);
    expect(plan.totalDistanceKm).toBe(13);
    expect(plan.estimatedFinishTime).toBe('11:39');
    expect(plan.routingSource).toBe('HAVERSINE');
    expect(plan.approximate).toBe(true);
    expect(plan.totalBoxes).toBe(8);
    expect(plan.totalRevenue).toBe(520);
    expect(plan.totalFoodCost).toBe(320);
    expect(plan.totalDeliveryCost).toBe(82);
    expect(plan.estimatedProfit).toBe(118);

    const [job0, job1] = plan.jobs;
    expect(job0!.stops.map((s) => s.orderId)).toEqual([3, 4]);
    expect(job0!.distanceKm).toBe(9);
    expect(job0!.durationMinutes).toBe(9);
    expect(job0!.estimatedFinishTime).toBe('11:39');
    expect(job0!.deliveryCost).toBe(51);
    expect(job0!.stops[0]).toMatchObject({ sequence: 1, distanceFromPreviousKm: 6, estimatedArrivalTime: '11:36' });
    expect(job0!.stops[1]).toMatchObject({ sequence: 2, distanceFromPreviousKm: 3, estimatedArrivalTime: '11:39' });
    expect(job1!.stops.map((s) => s.orderId)).toEqual([2, 1]);
    expect(job1!.distanceKm).toBe(4);
    expect(job1!.estimatedFinishTime).toBe('11:34');
    expect(job1!.deliveryCost).toBe(31);
  });

  it('rejects a plan with a missing order', () => {
    expect(() =>
      assembleRoutePlan(examInput({ jobs: [{ orderIds: [3, 4], riderId: 1, geometry: null }] })),
    ).toThrow(InfeasiblePlanError);
  });

  it('rejects a duplicated order', () => {
    expect(() =>
      assembleRoutePlan(
        examInput({
          jobs: [
            { orderIds: [3, 4], riderId: 1, geometry: null },
            { orderIds: [2, 1, 4], riderId: 2, geometry: null },
          ],
        }),
      ),
    ).toThrow(InfeasiblePlanError);
  });

  it('rejects a job with more than 3 orders', () => {
    expect(() =>
      assembleRoutePlan(
        examInput({
          orders: [
            ...examInput().orders,
            { orderId: 5, customerId: 5, customerName: 'E', phone: '0805', address: null, latitude: 0, longitude: 0, boxCount: 1 },
          ],
          jobs: [
            { orderIds: [3, 4, 5, 1], riderId: 1, geometry: null },
            { orderIds: [2], riderId: 2, geometry: null },
          ],
        }),
      ),
    ).toThrow(InfeasiblePlanError);
  });

  it('rejects a plan finishing after the deadline instead of calling it valid', () => {
    expect(() => assembleRoutePlan(examInput({ deadline: '11:35:00' }))).toThrow(
      InfeasiblePlanError,
    );
  });
});
