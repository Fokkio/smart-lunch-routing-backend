import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoutePlanModel } from "../../models/route-plan.model";
import { OrderModel } from "../../models/order.model";
import { CustomerModel } from "../../models/customer.model";
import { RiderModel } from "../../models/rider.model";
import { ShopSettingsModel } from "../../models/shop-settings.model";
import { fetchRouteGeometrySafe, fetchTravelMatrixWithFallback } from "../../infrastructure/routing/fallback-routing";
import { RoutePlanningService } from "../route-planning.service";
import { routeSignature } from '../../domain/delivery/alternative-plan';

// แทน model จริงด้วยฟังก์ชันจำลอง จึงไม่เรียกฐานข้อมูล
vi.mock("../../models/route-plan.model", () => ({
  RoutePlanModel: {
    deleteById: vi.fn(),
    create: vi.fn(),
    findFull: vi.fn(),
  },
}));
vi.mock("../../infrastructure/routing/fallback-routing", () => ({
  fetchTravelMatrixWithFallback: vi.fn(),
  fetchRouteGeometrySafe: vi.fn(),
}));
vi.mock("../../models/order.model", () => ({ OrderModel: { findAll: vi.fn() } }));
vi.mock("../../models/customer.model", () => ({ CustomerModel: { findByIds: vi.fn() } }));
vi.mock("../../models/rider.model", () => ({ RiderModel: { findAvailable: vi.fn() } }));
vi.mock("../../models/shop-settings.model", () => ({ ShopSettingsModel: { get: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RoutePlanningService.delete", () => {
  it("returns true when the plan exists and is removed", async () => {
    vi.mocked(RoutePlanModel.deleteById).mockResolvedValue(true);
    await expect(RoutePlanningService.delete(11889392)).resolves.toBe(true);
    expect(RoutePlanModel.deleteById).toHaveBeenCalledWith(11889392);
  });

  it("returns false when the plan does not exist", async () => {
    vi.mocked(RoutePlanModel.deleteById).mockResolvedValue(false);
    await expect(RoutePlanningService.delete(999)).resolves.toBe(false);
  });
});

describe("RoutePlanningService.generate rider capacity", () => {
  it("rejects four orders when only one rider is available", async () => {
    vi.mocked(ShopSettingsModel.get).mockResolvedValue({
      latitude: 16.2, longitude: 103.2, maxOrdersPerRider: 3,
    } as never);
    vi.mocked(OrderModel.findAll).mockResolvedValue([1, 2, 3, 4].map(id => ({
      id, customerId: id, boxes: 1, status: 'PENDING', orderDate: '2026-10-04', isSimulated: true,
    })));
    vi.mocked(CustomerModel.findByIds).mockImplementation(async ids => ids.map(id => ({
      id, name: `Customer ${id}`, phone: '', address: '', lat: 16.2, lng: 103.2,
    })));
    vi.mocked(RiderModel.findAvailable).mockResolvedValue([{
      id: 1, name: 'Rider', username: null, hasPassword: false, phone: null, isAvailable: true,
    }]);

    await expect(RoutePlanningService.generate('2026-10-04'))
      .rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining('at least 2') });
  });
});

describe("RoutePlanningService.generate route geometry", () => {
  it("requests geometry in the optimized stop order saved in the job", async () => {
    const shop = { latitude: 16.24631, longitude: 103.25286 };
    const far = { latitude: 16.3, longitude: 103.25 };
    const near = { latitude: 16.25, longitude: 103.25 };
    vi.mocked(ShopSettingsModel.get).mockResolvedValue({
      ...shop, maxOrdersPerRider: 3, deliveryStartTime: '11:30:00',
      deliveryDeadline: '12:30:00', riderSpeedKmh: 30,
      boxSalePrice: 65, boxFoodCost: 40, riderBaseCost: 15, riderCostPerKm: 2,
    } as never);
    vi.mocked(OrderModel.findAll).mockResolvedValue([1, 2].map(id => ({
      id, customerId: id, boxes: 1, status: 'PENDING', orderDate: '2026-10-04', isSimulated: true,
    })));
    vi.mocked(CustomerModel.findByIds).mockImplementation(async ids => ids.map(id => ({
      id, name: `Customer ${id}`, phone: '', address: '',
      lat: Number(id) === 1 ? far.latitude : near.latitude,
      lng: Number(id) === 1 ? far.longitude : near.longitude,
    })));
    vi.mocked(RiderModel.findAvailable).mockResolvedValue([{
      id: 1, name: 'Rider', username: null, hasPassword: false, phone: null, isAvailable: true,
    }]);
    vi.mocked(fetchTravelMatrixWithFallback).mockResolvedValue({
      pointIds: ['SHOP', '1', '2'],
      distancesKm: [[0, 10, 1], [1, 0, 1], [1, 1, 0]],
      durationsMinutes: [[0, 10, 1], [1, 0, 1], [1, 1, 0]],
      source: 'ROAD', approximate: false,
    });
    vi.mocked(fetchRouteGeometrySafe).mockResolvedValue({
      distanceKm: 2, durationMinutes: 2, geometry: null, approximate: true,
    });
    vi.mocked(RoutePlanModel.create).mockResolvedValue(7);
    vi.mocked(RoutePlanModel.findFull).mockResolvedValue({
      routePlanId: 7, riderCount: 1, routingSource: 'ROAD', approximate: false,
    } as never);

    await RoutePlanningService.generate('2026-10-04');

    expect(fetchRouteGeometrySafe).toHaveBeenCalledWith([shop, near, far], expect.anything());
    await RoutePlanningService.generate('2026-10-04',{orderIds:[2],startTime:'13:00',deadline:'14:00'});
    expect(RoutePlanModel.create).toHaveBeenLastCalledWith(expect.objectContaining({partialBatch:true,startTime:'13:00',deliveryDeadline:'14:00',jobs:[expect.objectContaining({totalOrders:1,stops:[expect.objectContaining({orderId:2})]})]}),'13:00');
    expect(RoutePlanModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        jobs: [expect.objectContaining({ stops: [
          expect.objectContaining({ orderId: 2 }),
          expect.objectContaining({ orderId: 1 }),
        ] })],
      }),
      '11:30:00',
    );
  });
});

describe('RoutePlanningService alternative plans', () => {
  beforeEach(() => {
    vi.mocked(ShopSettingsModel.get).mockResolvedValue({latitude:16,longitude:103,maxOrdersPerRider:2,deliveryStartTime:'11:00',deliveryDeadline:'14:00',stopServiceMinutes:2,riderSpeedKmh:30,boxSalePrice:65,boxFoodCost:40,riderBaseCost:15,riderCostPerKm:2} as never);
    vi.mocked(OrderModel.findAll).mockResolvedValue([1,2,3,4].map(id=>({id,customerId:id,boxes:1,status:'PENDING',orderDate:'2026-10-05',isSimulated:false})));
    vi.mocked(CustomerModel.findByIds).mockImplementation(async ids=>ids.map(id=>({id,name:`Customer ${id}`,phone:'',address:'',lat:16+id/1000,lng:103})));
    vi.mocked(RiderModel.findAvailable).mockResolvedValue([1,2].map(id=>({id,name:'Rider',username:'qa',hasPassword:true,phone:null,isAvailable:true})));
    const distances=[[0,1,1,1,1],[1,0,1,9,9],[1,1,0,9,9],[1,9,9,0,1],[1,9,9,1,0]];
    vi.mocked(fetchTravelMatrixWithFallback).mockResolvedValue({pointIds:['SHOP','1','2','3','4'],distancesKm:distances,durationsMinutes:distances,source:'ROAD',approximate:false});
    vi.mocked(fetchRouteGeometrySafe).mockResolvedValue({distanceKm:1,durationMinutes:1,geometry:null,approximate:true});
    vi.mocked(RoutePlanModel.create).mockResolvedValue(8);
    vi.mocked(RoutePlanModel.findFull).mockImplementation(async id=>id===7?{routePlanId:7,planDate:'2026-10-05',status:'GENERATED',jobs:[{stops:[{orderId:1},{orderId:3}]},{stops:[{orderId:2},{orderId:4}]}]} as never:{routePlanId:8,riderCount:2,routingSource:'ROAD',approximate:false} as never);
  });
  it('loads customers once, excludes the current grouping and persists only the distinct feasible plan',async()=>{
    await RoutePlanningService.generateAlternative('2026-10-05',{basePlanId:7});
    expect(CustomerModel.findByIds).toHaveBeenCalledTimes(1);
    const created=vi.mocked(RoutePlanModel.create).mock.calls[0]![0];
    expect(routeSignature(created.jobs.map(job=>job.stops.map(stop=>String(stop.orderId))))).not.toBe(routeSignature([['1','3'],['2','4']]));
    expect(created.totalDeliveryCost).toBe(46); // 2 × (15 + 2km × 2 baht × 2 boxes)
    expect(created.jobs.flatMap(job=>job.stops.map(stop=>stop.orderId)).sort()).toEqual([1,2,3,4]);
  });
  it('does not persist when no feasible distinct alternative is found',async()=>{
    await expect(RoutePlanningService.generateAlternative('2026-10-05',{basePlanId:7,startTime:'11:00',deadline:'11:01'})).rejects.toMatchObject({statusCode:422});
    expect(RoutePlanModel.create).not.toHaveBeenCalled();
  });
  it('inherits the draft time window unless explicitly overridden', async () => {
    const findFull = vi.mocked(RoutePlanModel.findFull).getMockImplementation()!;
    vi.mocked(RoutePlanModel.findFull).mockImplementation(async id => ({ ...await findFull(id), startTime: '13:00', deliveryDeadline: '15:00' }) as never);
    await RoutePlanningService.generateAlternative('2026-10-05', { basePlanId: 7 });
    expect(RoutePlanModel.create).toHaveBeenLastCalledWith(expect.objectContaining({ startTime: '13:00', deliveryDeadline: '15:00' }), '13:00');
    await RoutePlanningService.generateAlternative('2026-10-05', { basePlanId: 7, startTime: '14:00', deadline: '16:00' });
    expect(RoutePlanModel.create).toHaveBeenLastCalledWith(expect.objectContaining({ startTime: '14:00', deliveryDeadline: '16:00' }), '14:00');
  });
  it('rejects invalid/missing base IDs and stale drafts before searching',async()=>{
    await expect(RoutePlanningService.generateAlternative('2026-10-05')).rejects.toMatchObject({statusCode:400});
    await expect(RoutePlanningService.generateAlternative('2026-10-06',{basePlanId:7})).rejects.toMatchObject({statusCode:409});
    expect(fetchTravelMatrixWithFallback).not.toHaveBeenCalled();
  });
});
