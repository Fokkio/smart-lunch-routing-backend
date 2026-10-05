import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { closePool, getPool, withTransaction } from '../mysql.connection';
import { RoutePlanModel } from '../../models/route-plan.model';
import { ShopSettingsModel } from '../../models/shop-settings.model';
import { lockPlanning } from '../../models/plan-inputs';
import { hashPassword } from '../../middleware/auth';
import type { RoutePlanResponse } from '../../domain/routing/route-plan.types';

/**
 * Opt-in TiDB integration coverage for the plan-selection lifecycle.
 * Run RUN_DB_INTEGRATION=1 and QA_ALLOW_REAL_DB=yes from the backend directory.
 * Uses current shop settings without edits; removes only this run's new QA data.
 */
const integration = process.env.RUN_DB_INTEGRATION === '1';
const describeIntegration = integration ? describe : describe.skip;

describeIntegration('route plan lifecycle (TiDB)', () => {
  let fixture: { customerId: number; orderId: number; riderIds: number[] } | undefined;
  const planIds: number[] = [];
  const date = '2099-12-31';
  const suffix = randomBytes(6).toString('hex');
  const name = `QA lifecycle ${suffix}`;

  beforeAll(async () => {
    expect(process.env.QA_ALLOW_REAL_DB, 'Explicit QA write authorization is required').toBe('yes');
    const shop = await ShopSettingsModel.get();
    const passwordHash = await hashPassword(randomBytes(24).toString('base64url'));
    fixture = await withTransaction(async conn => {
      const [customer] = await conn.execute<ResultSetHeader>(
        'INSERT INTO customers(name,phone,address,latitude,longitude) VALUES(?,?,?,?,?)',
        [name, `qa-${suffix}`, 'QA lifecycle test only', shop.latitude, shop.longitude],
      );
      const riderIds: number[] = [];
      for (const index of [0, 1]) {
        const [rider] = await conn.execute<ResultSetHeader>(
          `INSERT INTO riders(rider_name,phone,is_available,status,username,password_hash,login_enabled)
           VALUES(?,?,TRUE,'ACTIVE',?,?,TRUE)`,
          [`${name} R${index}`, `qa-${suffix}-${index}`, `qa_lifecycle_${suffix}_${index}`, passwordHash],
        );
        riderIds.push(Number(rider.insertId));
      }
      const [order] = await conn.execute<ResultSetHeader>(
        "INSERT INTO orders(customer_id,order_date,box_count,status) VALUES(?,?,1,'PENDING')", [Number(customer.insertId), date],
      );
      return { customerId: Number(customer.insertId), orderId: Number(order.insertId), riderIds };
    });
    const start = shop.deliveryStartTime.slice(0, 5);
    const candidate: RoutePlanResponse = {
      planDate: date, status: 'GENERATED', routingSource: 'HAVERSINE', approximate: true,
      shop, partialBatch: true, riderCount: 1, totalDistanceKm: 0, estimatedFinishTime: start,
      totalBoxes: 1, totalRevenue: shop.boxSalePrice, totalFoodCost: shop.boxFoodCost,
      totalDeliveryCost: shop.riderBaseCost, estimatedProfit: shop.boxSalePrice - shop.boxFoodCost - shop.riderBaseCost,
      jobs: [{
        riderIndex: 0, riderId: null, totalOrders: 1, totalBoxes: 1, distanceKm: 0, durationMinutes: 0,
        estimatedStartTime: start, estimatedFinishTime: start, deliveryCost: shop.riderBaseCost, geometry: null, approximate: true,
        stops: [{
          sequence: 1, orderId: fixture.orderId, customerId: fixture.customerId,
          customerName: name, phone: `qa-${suffix}`, address: 'QA lifecycle test only',
          latitude: shop.latitude, longitude: shop.longitude, boxCount: 1,
          distanceFromPreviousKm: 0, travelTimeFromPreviousMin: 0,
          estimatedArrivalTime: start, deliveryStatus: 'WAITING', geometry: null,
        }],
      }],
    };
    for (const _ of [0, 1]) planIds.push(await RoutePlanModel.create(candidate, start));
  }, 60000);

  afterAll(async () => {
    try {
      if (!fixture) return; // Setup transaction failed: no committed fixtures.
      const own = fixture;
      await withTransaction(async conn => {
        await lockPlanning(conn);
        const [customers] = await conn.execute<RowDataPacket[]>(
          'SELECT customer_id FROM customers WHERE customer_id=? AND name=? FOR UPDATE', [own.customerId, name],
        );
        expect(customers).toHaveLength(1);
        for (const id of planIds) {
          const [foreignStops] = await conn.execute<RowDataPacket[]>(
            `SELECT djo.order_id FROM delivery_job_orders djo JOIN delivery_jobs dj ON dj.delivery_job_id=djo.delivery_job_id
             WHERE dj.route_plan_id=? AND djo.order_id<>?`, [id, own.orderId],
          );
          expect(foreignStops, 'Refuse cleanup of non-fixture orders').toHaveLength(0);
          await conn.execute(
            'DELETE djo FROM delivery_job_orders djo JOIN delivery_jobs dj ON dj.delivery_job_id=djo.delivery_job_id WHERE dj.route_plan_id=?', [id],
          );
          await conn.execute('DELETE FROM delivery_jobs WHERE route_plan_id=?', [id]);
          await conn.execute('DELETE FROM route_plans WHERE route_plan_id=? AND plan_date=?', [id, date]);
        }
        await conn.execute('DELETE FROM orders WHERE order_id=? AND customer_id=?', [own.orderId, own.customerId]);
        for (const [index, id] of own.riderIds.entries()) {
          await conn.execute('DELETE FROM riders WHERE rider_id=? AND username=?', [id, `qa_lifecycle_${suffix}_${index}`]);
        }
        await conn.execute('DELETE FROM customers WHERE customer_id=? AND name=?', [own.customerId, name]);
      });
      const [remaining] = await getPool().execute<RowDataPacket[]>('SELECT customer_id FROM customers WHERE customer_id=?', [own.customerId]);
      expect(remaining, 'QA cleanup must persist').toHaveLength(0);
      const [riders] = await getPool().execute<RowDataPacket[]>('SELECT rider_id FROM riders WHERE rider_id IN (?,?)', own.riderIds);
      expect(riders, 'No QA rider accounts should remain').toHaveLength(0);
      for (const id of planIds) {
        const [plans] = await getPool().execute<RowDataPacket[]>('SELECT route_plan_id FROM route_plans WHERE route_plan_id=?', [id]);
        expect(plans, 'No fixture plans should remain').toHaveLength(0);
      }
    } finally {
      await closePool();
    }
  }, 60000);

  it('selects Plan B and rejects its order in Plan A with a different ready rider', async () => {
    expect(fixture).toBeDefined();
    const own = fixture!;
    expect(planIds).toHaveLength(2);
    const [planAId, planBId] = planIds;
    const before = (await RoutePlanModel.list(date)).filter(plan => planIds.includes(plan.routePlanId!));
    expect(before).toHaveLength(2); // Avoid every() passing on an empty list.
    expect(before.every(plan => plan.status === 'GENERATED')).toBe(true);
    const a = await RoutePlanModel.findFull(planAId);
    const b = await RoutePlanModel.findFull(planBId);
    expect(a?.jobs[0].stops[0].orderId).toBe(own.orderId);
    expect(b?.shop).toEqual(await ShopSettingsModel.get());
    const [pending] = await getPool().execute<RowDataPacket[]>('SELECT status FROM orders WHERE order_id=?', [own.orderId]);
    expect(pending[0]?.status).toBe('PENDING');

    const selected = await RoutePlanModel.select(planBId, [{ jobId: b!.jobs[0].jobId!, riderId: own.riderIds[1] }]);
    expect(selected?.routePlanId).toBe(planBId);
    expect(selected?.status).toBe('SELECTED');
    expect(selected?.jobs[0].riderId).toBe(own.riderIds[1]);
    const [planned] = await getPool().execute<RowDataPacket[]>('SELECT status FROM orders WHERE order_id=?', [own.orderId]);
    expect(planned[0]?.status).toBe('PLANNED');

    // A gets another ready rider, so this proves duplicate-order rejection, not rider-busy rejection.
    await expect(RoutePlanModel.select(planAId, [{ jobId: a!.jobs[0].jobId!, riderId: own.riderIds[0] }])).rejects.toMatchObject({
      statusCode: 409, message: 'Orders, customers or shop settings changed; calculate a new plan',
    });
    const unchanged = await RoutePlanModel.findFull(planAId);
    expect(unchanged?.status).toBe('GENERATED');
    expect(unchanged?.jobs[0].riderId).toBeNull(); // Assignment rolls back with failed selection.
    expect((await RoutePlanModel.findFull(planBId))?.status).toBe('SELECTED');
  }, 60000);
  it('keeps previous-day unfinished work visible only to its rider and requires start before delivery', async () => {
    const own = fixture!;
    const planId = planIds[1];
    const jobId = (await RoutePlanModel.findFull(planId))!.jobs[0].jobId!;
    const riderId = own.riderIds[1];
    expect((await RoutePlanModel.findRiderJobs(riderId, '2100-01-01')).map(item => item.job.jobId)).toContain(jobId);
    expect(await RoutePlanModel.findRiderJobs(own.riderIds[0], '2100-01-01')).toEqual([]);
    expect(await RoutePlanModel.findRiderJobs(riderId, '2099-12-30')).toEqual([]);
    await RoutePlanModel.acknowledgeJob(jobId, riderId);
    await expect(RoutePlanModel.deliverStop(planId, jobId, own.orderId, riderId)).rejects.toMatchObject({ statusCode: 409 });
    expect((await RoutePlanModel.findFull(planId))!.jobs[0].stops[0].deliveryStatus).toBe('WAITING');
    await RoutePlanModel.acknowledgeJob(jobId, riderId, true);
    expect(await RoutePlanModel.deliverStop(planId, jobId, own.orderId, riderId)).toBe(true);
    expect(await RoutePlanModel.deliverStop(planId, jobId, own.orderId, riderId)).toBe(true);
    expect(await RoutePlanModel.findRiderJobs(riderId, '2100-01-01')).toEqual([]);
    expect((await RoutePlanModel.findRiderJobs(riderId, date))[0].job.status).toBe('COMPLETED');
  }, 60000);
});
