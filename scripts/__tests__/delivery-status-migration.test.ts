import {beforeEach,expect,it,vi} from 'vitest';
import {migrateDeliveryStatus} from '../migrate-delivery-status';
const db=vi.hoisted(()=>({execute:vi.fn(),query:vi.fn()}));
vi.mock('../../src/database/mysql.connection',()=>({getPool:()=>db,closePool:vi.fn()}));
beforeEach(()=>{db.execute.mockReset();db.query.mockReset();});
it('adds missing statuses while preserving legacy values and the existing default',async()=>{
  db.execute.mockResolvedValue([[{statusType:"enum('ASSIGNED','DELIVERING','DELIVERED','CANCELLED')",defaultValue:'ASSIGNED',nullable:'NO'}]]);
  await migrateDeliveryStatus();
  expect(db.query).toHaveBeenCalledWith("ALTER TABLE delivery_jobs MODIFY COLUMN status enum('ASSIGNED','DELIVERING','DELIVERED','CANCELLED','WAITING','COMPLETED') NOT NULL DEFAULT 'ASSIGNED'");
});
it('is idempotent and refuses an unexpected schema',async()=>{
  db.execute.mockResolvedValue([[{statusType:"enum('WAITING','DELIVERING','COMPLETED')",defaultValue:'WAITING',nullable:'NO'}]]);
  await migrateDeliveryStatus();expect(db.query).not.toHaveBeenCalled();
  db.execute.mockResolvedValue([[{statusType:'varchar(20)',defaultValue:'WAITING',nullable:'NO'}]]);
  await expect(migrateDeliveryStatus()).rejects.toThrow('Unexpected');
  expect(db.query).not.toHaveBeenCalled();
});
