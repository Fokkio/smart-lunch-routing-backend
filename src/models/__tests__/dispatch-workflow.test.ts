import {beforeEach,expect,it,vi} from 'vitest';
import {RoutePlanModel} from '../route-plan.model';
import {RiderModel} from '../rider.model';
import {ShopSettingsModel} from '../shop-settings.model';
import {validateSnapshot} from '../plan-inputs';
const db=vi.hoisted(()=>({execute:vi.fn(),query:vi.fn()}));
vi.mock('../../database/mysql.connection',()=>({getPool:()=>db,withTransaction:async(work:(conn:unknown)=>Promise<unknown>)=>work(db)}));
const shop={settingId:1,shopName:'Shop',latitude:16,longitude:103,deliveryStartTime:'11:30:00',deliveryDeadline:'12:30:00',maxOrdersPerRider:3,riderSpeedKmh:30,boxSalePrice:65,boxFoodCost:40,riderBaseCost:15,riderCostPerKm:2,stopServiceMinutes:0};
const stop={orderId:10,customerId:1,customerName:'A',phone:'0812345678',address:null,latitude:16,longitude:103,boxCount:1};
beforeEach(()=>{
 vi.restoreAllMocks();db.execute.mockReset();db.query.mockReset();
 vi.spyOn(ShopSettingsModel,'get').mockResolvedValue(shop);
 vi.spyOn(RoutePlanModel,'findFull').mockResolvedValue({routePlanId:2,status:'SELECTED'} as never);
 db.execute.mockImplementation(async(sql:string)=>{
  if(sql.startsWith('SELECT * FROM route_plans'))return [[{status:'GENERATED',plan_date:'2026-10-05',input_snapshot:{shop,stops:[stop]}}]];
  if(sql.startsWith('SELECT delivery_job_id'))return [[{delivery_job_id:20}]];
  if(sql.startsWith('SELECT r.rider_id'))return [[{rider_id:3}]];
  if(sql.includes('distinct_riders'))return [[{total:1,distinct_riders:1,unavailable:0}]];
  if(sql.includes('AS orderId'))return [[stop]];
  return [[]];
 });
});
it('allows another round with fresh pending orders and saves the chosen rider',async()=>{
 await expect(RoutePlanModel.select(2,[{jobId:20,riderId:3}])).resolves.toMatchObject({status:'SELECTED'});
 expect(db.execute).toHaveBeenCalledWith('UPDATE delivery_jobs SET rider_id=? WHERE delivery_job_id=? AND route_plan_id=?',[3,20,2]);
 expect(db.execute).toHaveBeenCalledWith('UPDATE route_plans SET status = ? WHERE route_plan_id = ?',['SELECTED',2]);
});
it('revalidates only explicitly selected batch orders and keeps other pending orders queued',async()=>{
 await expect(validateSnapshot(db as never,{shop,stops:[stop],scope:'BATCH'},'2026-10-05')).resolves.toBeUndefined();
 const call=db.execute.mock.calls.find(([sql])=>String(sql).includes('AS orderId'))!;
 expect(call[0]).toContain('o.order_id IN (?)');expect(call[1]).toEqual(['2026-10-05',10]);
 db.execute.mockResolvedValue([[]]);
 await expect(validateSnapshot(db as never,{shop,stops:[stop],scope:'BATCH'},'2026-10-05')).rejects.toMatchObject({statusCode:409});
});
it('rejects repeated riders and jobs belonging to another plan before assignment',async()=>{
 await expect(RoutePlanModel.select(2,[{jobId:20,riderId:3},{jobId:21,riderId:3}])).rejects.toMatchObject({statusCode:400});
 await expect(RoutePlanModel.select(2,[{jobId:99,riderId:3}])).rejects.toMatchObject({statusCode:400});
 expect(db.execute.mock.calls.some(([sql])=>String(sql).startsWith('UPDATE'))).toBe(false);
});
it('does not select a draft whose rider picked up another round',async()=>{
 const original=db.execute.getMockImplementation()!;
 db.execute.mockImplementation(async(sql:string)=>sql.includes('distinct_riders')?[[{total:1,distinct_riders:1,unavailable:1}]]:original(sql));
 await expect(RoutePlanModel.select(2)).rejects.toMatchObject({statusCode:422});
 expect(db.execute.mock.calls.some(([sql])=>String(sql).startsWith('UPDATE'))).toBe(false);
});
it('checks readiness before saving a manually chosen rider',async()=>{
 const original=db.execute.getMockImplementation()!;
 db.execute.mockImplementation(async(sql:string)=>sql.startsWith('SELECT r.rider_id')?[[]]:original(sql));
 await expect(RoutePlanModel.select(2,[{jobId:20,riderId:3}])).rejects.toMatchObject({statusCode:409});
 expect(db.execute.mock.calls.some(([sql])=>String(sql).startsWith('UPDATE'))).toBe(false);
});
it('requires the assigned identity and acknowledgement before starting',async()=>{
 db.execute.mockResolvedValue([[]]);
 await expect(RoutePlanModel.acknowledgeJob(20,999)).resolves.toBe(false);
 db.execute.mockImplementation(async(sql:string)=>sql.startsWith('SELECT dj.*')?[[{status:'WAITING',acknowledged_at:null}]]:[[]]);
 await expect(RoutePlanModel.acknowledgeJob(20,3,true)).rejects.toMatchObject({statusCode:409});
 await expect(RoutePlanModel.acknowledgeJob(20,3)).resolves.toBe(true);
 expect(db.execute).toHaveBeenCalledWith('UPDATE delivery_jobs SET acknowledged_at=COALESCE(acknowledged_at,UTC_TIMESTAMP()) WHERE delivery_job_id=?',[20]);
 db.execute.mockImplementation(async(sql:string)=>sql.startsWith('SELECT dj.*')?[[{status:'WAITING',acknowledged_at:'2026-10-05'}]]:[[]]);
 await expect(RoutePlanModel.acknowledgeJob(20,3,true)).resolves.toBe(true);
 expect(db.execute.mock.calls.some(([sql])=>String(sql).includes("SET o.status='DELIVERING'"))).toBe(true);
});
it('reports work state and daily workload, with fairness ahead of rider ID',async()=>{
 const common={rider_id:1,rider_name:'Rider',username:'rider',password_hash:'hash',login_enabled:1,is_available:1,status:'ACTIVE'};
 db.query.mockResolvedValue([[{...common,busy:1,delivering:1,assigned_orders_today:5},{...common,rider_id:2,busy:0,assigned_orders_today:0}]]);
 await expect(RiderModel.findAll()).resolves.toMatchObject([{workStatus:'DELIVERING',assignedOrdersToday:5},{workStatus:'READY',assignedOrdersToday:0}]);
 await RiderModel.findAvailable('2026-10-05');
 expect(db.query.mock.calls[1]![0]).toContain('ORDER BY assigned_orders_today,last_assigned_at,r.rider_id');
 expect(db.query.mock.calls[1]![1]).toEqual(['2026-10-05']);
});
