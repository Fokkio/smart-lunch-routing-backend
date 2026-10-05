import {beforeEach,expect,it,vi} from 'vitest';
import {migrateDispatch} from '../migrate-dispatch';
const db=vi.hoisted(()=>({execute:vi.fn(),query:vi.fn()}));
vi.mock('../../src/database/mysql.connection',()=>({getPool:()=>db,closePool:vi.fn(),withTransaction:async(work:(conn:unknown)=>Promise<unknown>)=>work(db)}));
beforeEach(()=>{db.execute.mockReset();db.query.mockReset();});
it('adds only missing columns and leaves current drafts/history outside its invalidation predicate',async()=>{
 const status={statusType:"enum('WAITING','DELIVERING','COMPLETED')",defaultValue:'WAITING',nullable:'NO'};
 db.execute.mockImplementation(async(sql:string)=>sql.startsWith('SELECT column_type')?[[status]]:sql.startsWith('SELECT 1')?[[]]:[{}]);
 db.query.mockResolvedValue([{}]);await migrateDispatch();
 expect(db.query.mock.calls.map(([sql])=>sql)).toEqual([
  'ALTER TABLE delivery_jobs ADD COLUMN acknowledged_at DATETIME NULL',
  'ALTER TABLE delivery_jobs ADD COLUMN assigned_at DATETIME NULL',
  'ALTER TABLE shop_settings ADD COLUMN stop_service_minutes INT NOT NULL DEFAULT 0',
 ]);
 const update=db.execute.mock.calls.find(([sql])=>String(sql).startsWith('UPDATE'))![0];
 expect(update).toContain("status='GENERATED'");expect(update).toContain("JSON_EXTRACT(input_snapshot,'$.shop.stopServiceMinutes') IS NULL");
 db.query.mockClear();db.execute.mockImplementation(async(sql:string)=>sql.startsWith('SELECT column_type')?[[status]]:[[{existing:1}]]);await migrateDispatch();
 expect(db.query).not.toHaveBeenCalled();
});
