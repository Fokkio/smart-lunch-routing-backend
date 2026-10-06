import {describe,it,expect,vi,beforeEach} from 'vitest';
import type {Request,Response} from 'express';
import {CustomerController} from '../customer.controller';
import {OrderController} from '../order.controller';
import {ShopSettingsModel} from '../../models/shop-settings.model';
import {CustomerService} from '../../services/customer.service';
import {OrderService} from '../../services/order.service';
vi.mock('../../models/shop-settings.model',()=>({ShopSettingsModel:{get:vi.fn()}}));
vi.mock('../../services/customer.service',()=>({CustomerService:{findNearby:vi.fn()}}));
vi.mock('../../services/order.service',()=>({OrderService:{findNearby:vi.fn()}}));
beforeEach(()=>{vi.clearAllMocks();vi.mocked(ShopSettingsModel.get).mockResolvedValue({latitude:16.25,longitude:103.25} as any);});
describe('nearby search uses persisted shop location',()=>{
 it('does not require client coordinates and ignores a supplied alternative center',async()=>{
  const res={json:vi.fn()} as unknown as Response;const next=vi.fn();
  await CustomerController.nearby({query:{}} as Request,res,next);
  expect(CustomerService.findNearby).toHaveBeenCalledWith(16.25,103.25,1);
  await OrderController.nearby({query:{lat:'0',lng:'0'}} as unknown as Request,res,next);
  expect(OrderService.findNearby).toHaveBeenCalledWith(16.25,103.25,2,{date:undefined,status:undefined});
  expect(next).not.toHaveBeenCalled();
  vi.mocked(ShopSettingsModel.get).mockResolvedValue({latitude:16.26,longitude:103.26} as any);
  await CustomerController.nearby({query:{}} as Request,res,next);
  expect(CustomerService.findNearby).toHaveBeenLastCalledWith(16.26,103.26,1);
  await OrderController.nearby({query:{radiusKm:'3.5'}} as unknown as Request,res,next);
  expect(OrderService.findNearby).toHaveBeenLastCalledWith(16.26,103.26,3.5,{date:undefined,status:undefined});
 });
});
