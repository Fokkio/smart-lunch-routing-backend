import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderModel } from '../order.model';

const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../database/mysql.connection', () => ({
  getPool: () => db,
  withTransaction: async (work: (conn: unknown) => Promise<unknown>) => work(db),
}));

const orderRow = { order_id: 7, customer_id: 1, box_count: 2, status: 'PENDING', order_date: '2026-10-24', is_simulated: 0 };

type Options = {
  orderExists?: boolean;
  selectedRows?: unknown[];
  simulatedRows?: Array<{ order_id: number }>;
  deletedOrders?: number;
};

/** จำลอง connection โดยแยกตอบตามชนิดคำสั่ง SQL แต่ละตัว */
function stubDb({ orderExists = true, selectedRows = [], simulatedRows = [{ order_id: 7 }], deletedOrders = 1 }: Options = {}): void {
  db.execute.mockImplementation(async (sql: string) => {
    if (sql === 'SELECT setting_id FROM shop_settings WHERE setting_id=1 FOR UPDATE') return [[{ setting_id: 1 }]];
    if (sql.startsWith('SELECT * FROM orders WHERE order_id=? FOR UPDATE')) return orderExists ? [[orderRow]] : [[]];
    if (sql.includes('is_simulated=TRUE') && sql.includes('FOR UPDATE')) return [simulatedRows];
    if (sql.includes("rp.status='SELECTED'")) return [selectedRows];
    if (sql.includes("rp.status IN ('GENERATED','REJECTED')")) return [[{}]];
    if (sql.startsWith('DELETE FROM orders')) return [{ affectedRows: deletedOrders }];
    return [[]];
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  db.execute.mockReset();
  stubDb();
});

const allStatements = (): string[] => db.execute.mock.calls.map(call => String(call[0]));

describe('OrderModel.delete with draft plan references', () => {
  it('removes draft/rejected references then deletes the order', async () => {
    await expect(OrderModel.delete('7')).resolves.toBe(true);
    const statements = allStatements();
    expect(statements.some(sql => sql.includes("rp.status='SELECTED'"))).toBe(true);
    expect(statements.some(sql => sql.includes('DELETE djo') && sql.includes("rp.status IN ('GENERATED','REJECTED')"))).toBe(true);
    expect(statements.some(sql => sql.startsWith('DELETE FROM orders WHERE order_id=?'))).toBe(true);
  });

  it('still refuses 409 when the order belongs to a confirmed plan', async () => {
    stubDb({ selectedRows: [{ route_plan_id: 3 }] });
    await expect(OrderModel.delete('7')).rejects.toMatchObject({ statusCode: 409 });
    const statements = allStatements();
    expect(statements.some(sql => sql.includes('DELETE djo'))).toBe(false);
    expect(statements.some(sql => sql.startsWith('DELETE FROM orders WHERE order_id=?'))).toBe(false);
  });

  it('returns false for an unknown order id and stops before guarding', async () => {
    stubDb({ orderExists: false });
    await expect(OrderModel.delete('9999')).resolves.toBe(false);
    expect(allStatements().some(sql => sql.includes("rp.status='SELECTED'"))).toBe(false);
  });
});

describe('OrderModel.deleteSimulated with plan references', () => {
  it('cleans draft references for every matched simulated id and returns the deleted count', async () => {
    stubDb({ simulatedRows: [{ order_id: 7 }, { order_id: 8 }], deletedOrders: 2 });
    await expect(OrderModel.deleteSimulated([7, 8])).resolves.toBe(2);
    const statements = allStatements();
    expect(statements.some(sql => sql.includes('DELETE djo') && sql.includes("rp.status IN ('GENERATED','REJECTED')"))).toBe(true);
    expect(statements.some(sql => sql.includes('DELETE FROM orders WHERE is_simulated=TRUE'))).toBe(true);
  });

  it('throws 409 without touching anything when a confirmed plan references one of the ids', async () => {
    stubDb({ selectedRows: [{ route_plan_id: 3 }], simulatedRows: [{ order_id: 7 }, { order_id: 8 }] });
    await expect(OrderModel.deleteSimulated([7, 8])).rejects.toMatchObject({ statusCode: 409 });
    const statements = allStatements();
    expect(statements.some(sql => sql.includes('DELETE djo'))).toBe(false);
    expect(statements.some(sql => sql.includes('DELETE FROM orders'))).toBe(false);
  });

  it('returns 0 when none of the ids are simulated', async () => {
    stubDb({ simulatedRows: [] });
    await expect(OrderModel.deleteSimulated([7, 8])).resolves.toBe(0);
    expect(allStatements().some(sql => sql.includes("rp.status='SELECTED'"))).toBe(false);
  });
});
