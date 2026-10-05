import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { closePool, getPool } from '../mysql.connection';
import { PlanConflictError, RoutePlanModel } from '../../models/route-plan.model';

/**
 * Opt-in TiDB integration coverage for the plan-selection lifecycle.
 * Run with RUN_DB_INTEGRATION=1 from backend after loading backend/.env.
 * The fixture uses a far-future date and is removed in afterAll.
 */
const integration = process.env.RUN_DB_INTEGRATION === '1';
const describeIntegration = integration ? describe : describe.skip;

describeIntegration('route plan lifecycle (TiDB)', () => {
  let customerId: number;
  let riderId: number;
  let orderId: number;
  let planAId: number;
  let planBId: number;
  let jobAId: number;
  let jobBId: number;
  const date = '2099-12-31';
  const suffix = String(Date.now());

  beforeAll(async () => {
    const pool = getPool();
    const [customer] = await pool.execute<ResultSetHeader>(
      'INSERT INTO customers(name, phone, address, latitude, longitude) VALUES(?,?,?,?,?)',
      [`Integration ${suffix}`, `integration-${suffix}`, 'Test address', 16.24631, 103.25286],
    );
    customerId = Number(customer.insertId);
    const [rider] = await pool.execute<ResultSetHeader>(
      'INSERT INTO riders(rider_name, phone, is_available) VALUES(?,?,TRUE)',
      [`Integration Rider ${suffix}`, `rider-${suffix}`],
    );
    riderId = Number(rider.insertId);
    const [order] = await pool.execute<ResultSetHeader>(
      'INSERT INTO orders(customer_id, order_date, box_count, status) VALUES(?,?,?,?)',
      [customerId, date, 1, 'PENDING'],
    );
    orderId = Number(order.insertId);
    const candidate = {
      planDate: date,
      status: 'GENERATED' as const,
      routingSource: 'ROAD' as const,
      approximate: false,
      riderCount: 1,
      totalDistanceKm: 1,
      estimatedFinishTime: '11:45',
      totalBoxes: 1,
      totalRevenue: 65,
      totalFoodCost: 40,
      totalDeliveryCost: 15,
      estimatedProfit: 10,
      jobs: [],
    };
    planAId = await RoutePlanModel.create(candidate, '11:30');
    planBId = await RoutePlanModel.create(candidate, '11:30');
    const [jobA] = await pool.execute<ResultSetHeader>(
      'INSERT INTO delivery_jobs(route_plan_id, rider_id, job_code, total_orders, total_boxes) VALUES(?,?,?,?,?)',
      [planAId, riderId, `IT-LIFECYCLE-A-${suffix}`, 1, 1],
    );
    jobAId = Number(jobA.insertId);
    const [jobB] = await pool.execute<ResultSetHeader>(
      'INSERT INTO delivery_jobs(route_plan_id, rider_id, job_code, total_orders, total_boxes) VALUES(?,?,?,?,?)',
      [planBId, riderId, `IT-LIFECYCLE-B-${suffix}`, 1, 1],
    );
    jobBId = Number(jobB.insertId);
    await pool.execute(
      'INSERT INTO delivery_job_orders(delivery_job_id, order_id, stop_sequence) VALUES(?,?,1)',
      [jobAId, orderId],
    );
    await pool.execute(
      'INSERT INTO delivery_job_orders(delivery_job_id, order_id, stop_sequence) VALUES(?,?,1)',
      [jobBId, orderId],
    );
  });

  afterAll(async () => {
    const pool = getPool();
    await pool.execute('DELETE FROM delivery_job_orders WHERE delivery_job_id IN (?,?)', [jobAId, jobBId]);
    await pool.execute('DELETE FROM delivery_jobs WHERE delivery_job_id IN (?,?)', [jobAId, jobBId]);
    await pool.execute('DELETE FROM route_plans WHERE route_plan_id IN (?,?)', [planAId, planBId]);
    await pool.execute('DELETE FROM orders WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM riders WHERE rider_id = ?', [riderId]);
    await pool.execute('DELETE FROM customers WHERE customer_id = ?', [customerId]);
    await closePool();
  });

  it('persists generated candidates, selects Plan B, and rejects selecting Plan A', async () => {
    const before = await RoutePlanModel.list(date);
    expect(before.filter((plan) => [planAId, planBId].includes(plan.routePlanId!)).every((plan) => plan.status === 'GENERATED')).toBe(true);
    const [pending] = await getPool().execute<Array<RowDataPacket & { status: string }>>('SELECT status FROM orders WHERE order_id = ?', [orderId]);
    expect(pending[0]?.status).toBe('PENDING');

    const selected = await RoutePlanModel.select(planBId);
    expect(selected?.routePlanId).toBe(planBId);
    expect(selected?.status).toBe('SELECTED');
    const [planned] = await getPool().execute<Array<RowDataPacket & { status: string }>>('SELECT status FROM orders WHERE order_id = ?', [orderId]);
    expect(planned[0]?.status).toBe('PLANNED');

    await expect(RoutePlanModel.select(planAId)).rejects.toBeInstanceOf(PlanConflictError);
  });
});
