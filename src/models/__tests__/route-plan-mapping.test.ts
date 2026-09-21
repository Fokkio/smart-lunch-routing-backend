import { describe, expect, it } from 'vitest';
import { toISODate, todayLocal } from '../dates';
import {
  toJobResponse,
  toPlanSummary,
  type JobRow,
  type PlanRow,
  type StopRow,
} from '../route-plan.model';

/**
 * Regression tests for the list-summary contract, built from the LIVE
 * RoutePlan #1 values (no Aiven dependency — pure mapping functions).
 */
function livePlanRow(): PlanRow {
  return {
    route_plan_id: 1,
    // mysql2 returns DATE columns as local-midnight Date objects.
    plan_date: new Date(2026, 8, 21),
    start_time: '11:30:00',
    estimated_finish_time: '11:32:00',
    rider_count: 1,
    total_distance_km: 0.76,
    total_delivery_cost: 18.04,
    total_revenue: 390,
    total_food_cost: 240,
    estimated_profit: 131.96,
    status: 'GENERATED',
    routing_source: 'ROAD',
    approximate: 0,
  } as PlanRow;
}

function liveJobRow(): JobRow {
  return {
    delivery_job_id: 1,
    route_plan_id: 1,
    rider_id: 1,
    job_code: 'P1-R1',
    total_orders: 2,
    total_boxes: 6,
    total_distance_km: 0.76,
    estimated_duration_min: 2,
    estimated_start_time: '11:30:00',
    estimated_finish_time: '11:32:00',
    delivery_cost: 18.04,
    route_geometry: {
      type: 'LineString',
      coordinates: [[103.25286, 16.24631], [103.2531, 16.2469]],
    },
  } as unknown as JobRow;
}

function liveStopRows(): StopRow[] {
  return [
    {
      order_id: 1, stop_sequence: 1, distance_from_previous_km: 0.4,
      travel_time_from_previous_min: 1, estimated_arrival_time: '11:31:00',
      customer_id: 1, box_count: 3, customer_name: 'Seed One',
      customer_phone: '0800000001', customer_address: 'Khon Kaen',
      customer_latitude: 16.2469, customer_longitude: 103.2531,
    },
    {
      order_id: 2, stop_sequence: 2, distance_from_previous_km: 0.36,
      travel_time_from_previous_min: 1, estimated_arrival_time: '11:32:00',
      customer_id: 2, box_count: 3, customer_name: 'Seed Two',
      customer_phone: '0800000002', customer_address: 'Khon Kaen',
      customer_latitude: 16.2457, customer_longitude: 103.2542,
    },
  ] as StopRow[];
}

describe('toPlanSummary (GET /api/route-plans)', () => {
  it('returns real persisted metrics, never fake zeros', () => {
    expect(toPlanSummary(livePlanRow(), 6)).toEqual({
      routePlanId: 1,
      planDate: '2026-09-21',
      status: 'GENERATED',
      routingSource: 'ROAD',
      approximate: false,
      riderCount: 1,
      totalDistanceKm: 0.76,
      estimatedFinishTime: '11:32',
      totalBoxes: 6,
      totalRevenue: 390,
      totalFoodCost: 240,
      totalDeliveryCost: 18.04,
      estimatedProfit: 131.96,
    });
  });

  it('omits jobs from the summary contract', () => {
    expect('jobs' in toPlanSummary(livePlanRow(), 6)).toBe(false);
  });
});

describe('toJobResponse (GET /api/route-plans/:id)', () => {
  it('hydrates jobs, stops, customer data, and geometry', () => {
    const job = toJobResponse(liveJobRow(), liveStopRows(), 0, false);
    expect(job.jobCode).toBe('P1-R1');
    expect(job.totalBoxes).toBe(6);
    expect(job.deliveryCost).toBe(18.04);
    expect(job.geometry).toEqual({
      type: 'LineString',
      coordinates: [[103.25286, 16.24631], [103.2531, 16.2469]],
    });
    expect(job.stops).toHaveLength(2);
    expect(job.stops[0]).toMatchObject({
      sequence: 1, orderId: 1, customerName: 'Seed One', boxCount: 3,
    });
    expect(job.stops[1]).toMatchObject({
      sequence: 2, orderId: 2, customerName: 'Seed Two', boxCount: 3,
    });
  });
});

describe('toISODate', () => {
  it('serializes a driver Date object as ISO YYYY-MM-DD', () => {
    expect(toISODate(new Date(2026, 8, 21))).toBe('2026-09-21');
  });

  it('passes ISO strings through unchanged', () => {
    expect(toISODate('2026-09-21')).toBe('2026-09-21');
  });

  it('never emits weekday-prefixed dates', () => {
    expect(toISODate(new Date(2026, 8, 21))).not.toMatch(/^[A-Z][a-z]{2} /);
  });

  it('todayLocal returns a calendar YYYY-MM-DD string', () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
