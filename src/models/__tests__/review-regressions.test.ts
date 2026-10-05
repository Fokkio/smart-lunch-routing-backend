import { beforeEach, describe, expect, it, vi } from 'vitest';
import { guardPlanEdit, snapshotStop, validateSnapshot, type PlanSnapshot } from '../plan-inputs';
import { RoutePlanModel, toJobResponse, type JobRow, type StopRow } from '../route-plan.model';
import { RiderModel } from '../rider.model';
import { ShopSettingsModel, type ShopSettings } from '../shop-settings.model';
import { OrderService } from '../../services/order.service';
import { RiderService } from '../../services/rider.service';
import { errorHandler } from '../../middleware/error-handler';

const db = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn() }));
vi.mock('../../database/mysql.connection', () => ({ getPool: () => db, withTransaction: async (work: (conn: unknown) => Promise<unknown>) => work(db) }));
const shop: ShopSettings = { settingId: 1, shopName: 'Shop', latitude: 16, longitude: 103,
  deliveryStartTime: '11:30:00', deliveryDeadline: '13:00:00', maxOrdersPerRider: 3,
  riderSpeedKmh: 30, boxSalePrice: 65, boxFoodCost: 40, riderBaseCost: 15, riderCostPerKm: 2 };
const stop = { orderId: 1, customerId: 2, customerName: 'Customer', phone: '0890000000', address: 'A', latitude: 16.1, longitude: 103.1, boxCount: 2 };
const snapshot: PlanSnapshot = { shop, stops: [stop] };

beforeEach(() => { vi.restoreAllMocks(); db.execute.mockReset(); db.query.mockReset(); });
describe('delivery plan integrity', () => {
  it('accepts unchanged inputs but rejects changed quantities, coordinates, cancelled/missing orders and new pending orders', async () => {
    vi.spyOn(ShopSettingsModel, 'get').mockResolvedValue(shop);
    db.execute.mockResolvedValue([[stop]]);
    await expect(validateSnapshot(db as never, snapshot, '2026-10-05')).resolves.toBeUndefined();
    for (const rows of [[{ ...stop, boxCount: 3 }], [{ ...stop, latitude: 17 }], [], [stop, { ...stop, orderId: 3 }]]) {
      db.execute.mockResolvedValue([rows]);
      await expect(validateSnapshot(db as never, snapshot, '2026-10-05')).rejects.toMatchObject({ statusCode: 409 });
    }
    expect(db.execute.mock.calls[0]![0]).toContain("o.status='PENDING'");
  });
  it('rejects a settings change even if orders are unchanged', async () => {
    db.execute.mockResolvedValue([[stop]]);
    vi.spyOn(ShopSettingsModel, 'get').mockResolvedValue({ ...shop, latitude: 17 });
    await expect(validateSnapshot(db as never, snapshot, '2026-10-05')).rejects.toMatchObject({ statusCode: 409 });
  });
  it('blocks edits to selected work and invalidates affected drafts otherwise', async () => {
    db.execute.mockResolvedValueOnce([[{ route_plan_id: 4 }]]);
    await expect(guardPlanEdit(db as never, 'o.order_id=?', [1])).rejects.toMatchObject({ statusCode: 409 });
    expect(db.execute).toHaveBeenCalledTimes(1);
    db.execute.mockReset().mockResolvedValue([[]]);
    await guardPlanEdit(db as never, 'o.order_id=?', [1]);
    expect(db.execute.mock.calls[1]![0]).toContain("SET rp.status='REJECTED'");
  });
  it('selects an unchanged draft with usable rider accounts', async () => {
    vi.spyOn(ShopSettingsModel, 'get').mockResolvedValue(shop);
    vi.spyOn(RoutePlanModel, 'findFull').mockResolvedValue({ routePlanId: 4, status: 'SELECTED' } as never);
    db.execute.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT * FROM route_plans')) return [[{ status: 'GENERATED', plan_date: '2026-10-05', input_snapshot: snapshot }]];
      if (sql.includes('distinct_riders')) return [[{ total: 1, distinct_riders: 1, unavailable: 0 }]];
      if (sql.includes('AS orderId')) return [[stop]];
      return [[]];
    });
    await expect(RoutePlanModel.select(4)).resolves.toMatchObject({ status: 'SELECTED' });
    expect(db.execute).toHaveBeenCalledWith('UPDATE route_plans SET status = ? WHERE route_plan_id = ?', ['SELECTED', 4]);
  });
  it('does not select a cancelled-order draft', async () => {
    db.execute.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT * FROM route_plans')) return [[{ status: 'GENERATED', plan_date: '2026-10-05', input_snapshot: snapshot }]];
      if (sql.includes('distinct_riders')) return [[{ total: 1, distinct_riders: 1, unavailable: 0 }]];
      return [[]];
    });
    await expect(RoutePlanModel.select(4)).rejects.toMatchObject({ statusCode: 409 });
    expect(db.execute.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  });
  it('cannot deliver an order that was cancelled or left pending', async () => {
    for (const status of ['CANCELLED', 'PENDING']) {
      db.execute.mockResolvedValue([[{ status: 'SELECTED', delivery_status: status, acknowledged_at:'2026-10-05', stop_sequence: 1, rider_id: 2 }]]);
      await expect(RoutePlanModel.deliverStop(1, 2, 3, 2)).rejects.toMatchObject({ statusCode: 409 });
    }
  });
  it('uses saved stop fields while retaining current delivery status', () => {
    const row = { order_id: 1, customer_id: 2, customer_name: 'Changed', customer_phone: '', customer_address: 'B', customer_latitude: 17, customer_longitude: 104, box_count: 3, delivery_status: 'DELIVERED' } as StopRow;
    const job = { delivery_job_id: 1, job_code: 'P1-R1', total_orders: 1, total_boxes: 2, rider_id: 2 } as JobRow;
    expect(toJobResponse(job, [row], 0, false, snapshot).stops[0]).toMatchObject({ ...snapshotStop(stop), deliveryStatus: 'DELIVERED' });
  });
});
describe('rider account and API boundaries', () => {
  it('keeps a rider with delivery history and does not delete sessions or jobs', async () => {
    db.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ rider_id: 2 }]]).mockResolvedValueOnce([[{ delivery_job_id: 7 }]]);
    await expect(RiderModel.delete('2')).rejects.toMatchObject({ statusCode: 409 });
    expect(db.execute.mock.calls.some(([sql]) => String(sql).startsWith('DELETE'))).toBe(false);
  });
  it('requires a usable login account when looking up available riders', async () => {
    db.query.mockResolvedValue([[]]); await RiderModel.findAvailable();
    expect(db.query.mock.calls[0]![0]).toContain('login_enabled=TRUE AND username IS NOT NULL AND password_hash IS NOT NULL');
  });
  it('rejects malformed order/rider payloads before database access', async () => {
    for (const input of [null, [], { status: 123 }, { customerId: 0 }, { orderDate: '2026-02-30' }]) {
      expect(() => OrderService.update('1', input as never)).toThrow();
    }
    for (const input of [null, [], { name: '' }, { name: 'A', isAvailable: 'false' }, { name: 'A', phone: 123 }]) {
      await expect(RiderService.create(input as never)).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(db.execute).not.toHaveBeenCalled();
  });
  it('hides SQL errors while preserving client-facing 400 messages', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    errorHandler(new Error('SQL password_hash internal'), {} as never, res as never, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Service unavailable; please try again later' });
    errorHandler(Object.assign(new Error('Bad input'), { statusCode: 400 }), {} as never, res as never, vi.fn());
    expect(res.json).toHaveBeenLastCalledWith({ message: 'Bad input' });
  });
});
