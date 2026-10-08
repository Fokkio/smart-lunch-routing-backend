import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../../database/mysql.connection';
import { RoutePlanModel, type JobRow, type PlanRow, type StopRow } from '../route-plan.model';

vi.mock('../../database/mysql.connection', () => ({ getPool: vi.fn(), withTransaction: vi.fn() }));
const execute = vi.fn();
const connection = { execute } as unknown as PoolConnection;
const jobs = [20, 21].map(
  (id) =>
    ({
      delivery_job_id: id,
      route_plan_id: 7,
      rider_id: 9,
      job_code: `P7-R${id}`,
      total_orders: 1,
      total_boxes: 2,
      estimated_start_time: '11:30:00',
      estimated_finish_time: '11:32:00',
      status: 'DELIVERING',
      route_geometry: {
        type: 'LineString',
        coordinates: [
          [103, 16],
          [103.01, 16.01],
        ],
      },
    }) as JobRow,
);
const stops = jobs.map(
  (job) =>
    ({
      delivery_job_id: job.delivery_job_id,
      order_id: job.delivery_job_id + 100,
      stop_sequence: 1,
      customer_id: 1,
      box_count: 2,
      customer_name: 'Current name',
      customer_phone: '0812345678',
      customer_address: '',
      customer_latitude: 16,
      customer_longitude: 103,
      delivery_status: 'DELIVERED',
    }) as StopRow,
);
const snapshot = {
  shop: { deliveryDeadline: '12:30:00' },
  window: { deadline: '12:00' },
  stops: [{ orderId: 120, customerName: 'Saved name', latitude: 16.1, longitude: 103.1 }],
};
const plan = {
  route_plan_id: 7,
  plan_date: '2026-10-08',
  start_time: '11:30:00',
  status: 'SELECTED',
  total_revenue: 260,
  total_food_cost: 160,
  total_delivery_cost: 38,
  estimated_profit: 62,
  approximate: false,
  input_snapshot: JSON.stringify(snapshot),
} as PlanRow;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getPool).mockReturnValue(connection as unknown as ReturnType<typeof getPool>);
});

describe('batched route plan reads', () => {
  it('reads every job with the supplied transaction and preserves saved inputs and geometry', async () => {
    execute
      .mockResolvedValueOnce([[plan]])
      .mockResolvedValueOnce([jobs])
      .mockResolvedValueOnce([stops]);
    const result = await RoutePlanModel.findFull(7, connection);
    expect(getPool).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(3);
    expect(execute.mock.calls[2][0]).toContain('IN (?,?)');
    expect(execute.mock.calls[2][0]).toContain('ORDER BY jbo.delivery_job_id, jbo.stop_sequence');
    expect(execute.mock.calls[2][1]).toEqual([20, 21]);
    expect(result).toMatchObject({ totalBoxes: 4, totalRevenue: 260, deliveryDeadline: '12:00' });
    expect(result?.jobs.map((job) => job.stops.map((stop) => stop.orderId))).toEqual([
      [120],
      [121],
    ]);
    expect(result?.jobs[0].stops[0]).toMatchObject({
      customerName: 'Saved name',
      latitude: 16.1,
      deliveryStatus: 'DELIVERED',
    });
    expect(result?.jobs[0].geometry).toEqual(jobs[0].route_geometry);
  });

  it('does not query jobs or stops for an unknown plan', async () => {
    execute.mockResolvedValueOnce([[]]);
    await expect(RoutePlanModel.findFull(7)).resolves.toBeNull();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('does not generate an empty IN clause for a plan without jobs', async () => {
    execute.mockResolvedValueOnce([[plan]]).mockResolvedValueOnce([[]]);
    await expect(RoutePlanModel.findFull(7)).resolves.toMatchObject({ totalBoxes: 0, jobs: [] });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('groups rider stops without mixing jobs from different plans', async () => {
    execute
      .mockResolvedValueOnce([
        jobs.map((job, index) => ({
          ...job,
          route_plan_id: 7 + index,
          input_snapshot: JSON.stringify(snapshot),
          approximate: index === 1,
        })),
      ])
      .mockResolvedValueOnce([stops]);
    const result = await RoutePlanModel.findRiderJobs(9, '2026-10-08');
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0][1]).toEqual([9, '2026-10-08', '2026-10-08']);
    expect(result.map((item) => [item.planId, item.job.jobId, item.job.stops[0].orderId])).toEqual([
      [7, 20, 120],
      [8, 21, 121],
    ]);
    expect(result.map((item) => item.job.approximate)).toEqual([false, true]);
    expect(result[0].deliveryDeadline).toBe('12:00');
  });

  it('skips the stop query when the rider has no jobs', async () => {
    execute.mockResolvedValueOnce([[]]);
    await expect(RoutePlanModel.findRiderJobs(9, '2026-10-08')).resolves.toEqual([]);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
