import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/mysql.connection';
import { lockPlanning } from './plan-inputs';
import { validateSettings } from '../services/shop-settings-validation';
export type ShopSettings = {
 settingId:number; shopName:string; latitude:number; longitude:number; deliveryStartTime:string;
 deliveryDeadline:string; maxOrdersPerRider:number; riderSpeedKmh:number; boxSalePrice:number;
 boxFoodCost:number; riderBaseCost:number; riderCostPerKm:number;
};
function map(r:RowDataPacket):ShopSettings {
 return {settingId:r.setting_id,shopName:r.shop_name,latitude:Number(r.latitude),longitude:Number(r.longitude),
 deliveryStartTime:String(r.delivery_start_time),deliveryDeadline:String(r.delivery_deadline),
 maxOrdersPerRider:Number(r.max_orders_per_rider),riderSpeedKmh:Number(r.rider_speed_kmh),
 boxSalePrice:Number(r.box_sale_price),boxFoodCost:Number(r.box_food_cost),
 riderBaseCost:Number(r.rider_base_cost),riderCostPerKm:Number(r.rider_cost_per_km)};
}
export class ShopSettingsModel {
 static async get(conn?:PoolConnection):Promise<ShopSettings> {
  const [rows]=await (conn??getPool()).query<RowDataPacket[]>('SELECT * FROM shop_settings WHERE setting_id=1');
  if(!rows[0])throw new Error('shop_settings row 1 is missing; run db:seed.');
  return map(rows[0]);
 }
 static async update(input:Partial<ShopSettings>):Promise<ShopSettings> {
  return withTransaction(async conn=>{
   await lockPlanning(conn);
   validateSettings(input, await this.get(conn));
   const [legacy]=await conn.execute<RowDataPacket[]>("SELECT route_plan_id FROM route_plans WHERE status='SELECTED' AND input_snapshot IS NULL LIMIT 1");
   if(legacy.length)throw Object.assign(new Error('Upgrade saved plan snapshots before changing shop settings'),{statusCode:409});
   await conn.execute('UPDATE shop_settings SET shop_name=COALESCE(?,shop_name),latitude=COALESCE(?,latitude),longitude=COALESCE(?,longitude),delivery_start_time=COALESCE(?,delivery_start_time),delivery_deadline=COALESCE(?,delivery_deadline),max_orders_per_rider=COALESCE(?,max_orders_per_rider),rider_speed_kmh=COALESCE(?,rider_speed_kmh),box_sale_price=COALESCE(?,box_sale_price),box_food_cost=COALESCE(?,box_food_cost),rider_base_cost=COALESCE(?,rider_base_cost),rider_cost_per_km=COALESCE(?,rider_cost_per_km) WHERE setting_id=1',[input.shopName??null,input.latitude??null,input.longitude??null,input.deliveryStartTime??null,input.deliveryDeadline??null,input.maxOrdersPerRider??null,input.riderSpeedKmh??null,input.boxSalePrice??null,input.boxFoodCost??null,input.riderBaseCost??null,input.riderCostPerKm??null]);
   await conn.execute("UPDATE route_plans SET status='REJECTED' WHERE status='GENERATED'");
   return this.get(conn);
  });
 }
}
