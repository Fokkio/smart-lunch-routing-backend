import { beforeEach, expect, it, vi } from 'vitest';
import { migrateReview } from '../migrate-review';
const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));
vi.mock('../../src/database/mysql.connection', () => ({ getPool: () => db, closePool: vi.fn(), withTransaction: async (work: (conn: unknown) => Promise<unknown>) => work(db) }));
vi.mock('../../src/models/shop-settings.model', () => ({ ShopSettingsModel: { get: vi.fn().mockResolvedValue({}) } }));
beforeEach(() => { db.query.mockReset(); db.execute.mockReset(); });
it('stops on duplicate phone numbers before changing schema or data', async () => {
  db.query.mockResolvedValueOnce([[{ duplicate: 1 }]]);
  await expect(migrateReview()).rejects.toThrow('duplicate phone');
  expect(db.execute).not.toHaveBeenCalled();
  expect(db.query).toHaveBeenCalledTimes(1);
});
it('can rerun when columns, uniqueness and restrictive foreign keys already exist', async () => {
  db.query.mockImplementation(async (sql: string) => sql.includes('referential_constraints') ? [[{ constraint_name: 'fk_rider', delete_rule: 'RESTRICT' }]] : [[]]);
  db.execute.mockResolvedValue([[{ existing: 1 }]]);
  await migrateReview(); await migrateReview();
  expect(db.query.mock.calls.some(([sql]) => String(sql).startsWith('ALTER'))).toBe(false);
});
it('finishes snapshot data but reports failure when the foreign key grant is missing', async () => {
  db.execute.mockResolvedValue([[{ existing: 1 }]]);
  db.query.mockImplementation(async (sql: string) => {
    if (sql.includes('referential_constraints')) return [[{ constraint_name: 'fk_rider', delete_rule: 'SET NULL' }]];
    if (sql.startsWith('ALTER')) throw new Error('REFERENCES command denied');
    return [[]];
  });
  await expect(migrateReview()).rejects.toThrow('REFERENCES command denied');
  expect(db.execute.mock.calls.some(([sql]) => String(sql).includes("SET status='REJECTED'"))).toBe(true);
});
