import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerService } from '../../services/customer.service';
import { OrderService } from '../../services/order.service';
import { CustomerModel } from '../customer.model';
import { OrderModel } from '../order.model';
import { RoutePlanModel } from '../route-plan.model';
import { todayLocal } from '../dates';
import { clearDatabase } from '../../database/clear-database';

const sql = vi.hoisted(() => vi.fn());
vi.mock('../../database/mysql.connection', () => ({
  getPool: () => ({ execute: sql, query: sql }),
  withTransaction: async (work: (conn: unknown) => unknown) => work({ execute: sql, query: sql }),
}));

describe('audit fix regressions without real DB writes', () => {
  beforeEach(() => { sql.mockReset(); sql.mockResolvedValue([[], []]); });
  it.each(['PLANNED', 'DELIVERING', 'DELIVERED', 'CANCELLED'])('rejects creation with workflow status %s', status => {
    expect(() => OrderService.create({ customerId: 1, boxes: 1, status } as never)).toThrow('PENDING');
    expect(sql).not.toHaveBeenCalled();
  });
  it.each(['PLANNED', 'DELIVERING', 'DELIVERED'])('rejects manual workflow update %s', status => {
    expect(() => OrderService.update('9', { status } as never)).toThrow('delivery jobs');
    expect(sql).not.toHaveBeenCalled();
  });
  it('rejects editing a legacy delivered order even without a selected plan', async () => {
    sql.mockImplementation(async query => query.startsWith('SELECT * FROM orders') ? [[{ status: 'DELIVERED' }], []] : [[], []]);
    await expect(OrderModel.update('9', { status: 'PENDING' })).rejects.toMatchObject({ statusCode: 409 });
    expect(sql.mock.calls.some(([query]) => query.startsWith('UPDATE orders'))).toBe(false);
  });
  it('requires an explicit clear scope and never clears real orders', async () => {
    await expect(OrderService.deleteSimulated([])).rejects.toMatchObject({ statusCode: 400 });
    sql.mockResolvedValue([{ affectedRows: 2 }, []]);
    await expect(OrderService.deleteSimulated([7, 9])).resolves.toBe(2);
    expect(sql).toHaveBeenCalledWith('DELETE FROM orders WHERE is_simulated=TRUE AND order_id IN (?,?)', [7, 9]);
  });
  it('validates effective legacy names before the model', async () => {
    const create = vi.spyOn(CustomerModel, 'create').mockResolvedValue({} as never);
    for (const first_name of ['x'.repeat(151), { name: 'bad' }]) {
      await expect(CustomerService.create({ first_name, phone: '0812345678', lat: 16, lng: 103 } as never)).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(create).not.toHaveBeenCalled(); create.mockRestore();
  });
  it.each(['DELIVERED', 'COMPLETED', 'CANCELLED'])('cannot restart terminal job %s', async status => {
    sql.mockImplementation(async query => query.startsWith('SELECT dj.*') ? [[{ status, acknowledged_at: '2026-10-05' }], []] : [[], []]);
    await expect(RoutePlanModel.acknowledgeJob(7, 2, true)).rejects.toMatchObject({ statusCode: 409 });
    expect(sql.mock.calls.some(([query]) => query.startsWith('UPDATE delivery_jobs'))).toBe(false);
  });
  it('uses the Bangkok date at UTC midnight boundary', () => {
    expect(todayLocal(new Date('2026-10-05T17:00:00Z'))).toBe('2026-10-06');
    expect(todayLocal(new Date('2026-10-05T16:59:59Z'))).toBe('2026-10-05');
  });
  it('preflights every table before any destructive query', async () => {
    await expect(clearDatabase({ query: sql } as never)).rejects.toThrow('missing tables');
    expect(sql).toHaveBeenCalledTimes(1);
  });
  it('clears child-first without disabling FK checks or resetting sequences', async () => {
    const tables = ['auth_sessions', 'auth_login_attempts', 'delivery_job_orders', 'delivery_jobs', 'route_plans', 'orders', 'riders', 'customers', 'admin_users'];
    sql.mockResolvedValueOnce([tables.map(TABLE_NAME => ({ TABLE_NAME })), []]);
    await clearDatabase({ query: sql } as never);
    expect(sql.mock.calls.slice(1).map(([query]) => query)).toEqual(tables.map(table => `DELETE FROM ${table}`));
  });
});
