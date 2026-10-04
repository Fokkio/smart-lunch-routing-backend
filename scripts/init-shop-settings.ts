import { type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { closePool, getPool } from '../src/database/mysql.connection';

type CountRow = RowDataPacket & { count: number };

type DefaultShopSettings = {
  settingId: number;
  shopName: string;
  latitude: number;
  longitude: number;
  deliveryStartTime: string;
  deliveryDeadline: string;
  maxOrdersPerRider: number;
  riderSpeedKmh: number;
  boxSalePrice: number;
  boxFoodCost: number;
  riderBaseCost: number;
  riderCostPerKm: number;
};

// Values are reused from the existing backend seed, schema defaults, and
// routing documentation. These are project defaults, not guessed coordinates.
const DEFAULT_SHOP_SETTINGS: DefaultShopSettings = {
  settingId: 1,
  shopName: 'Smart Lunch Shop',
  latitude: 16.24631,
  longitude: 103.25286,
  deliveryStartTime: '11:30:00',
  deliveryDeadline: '12:30:00',
  maxOrdersPerRider: 3,
  riderSpeedKmh: 30,
  boxSalePrice: 65,
  boxFoodCost: 40,
  riderBaseCost: 15,
  riderCostPerKm: 2,
};

async function main(): Promise<void> {
  const pool = getPool();
  const [existing] = await pool.query<CountRow[]>(
    'SELECT COUNT(*) AS count FROM shop_settings WHERE setting_id = ?',
    [DEFAULT_SHOP_SETTINGS.settingId],
  );

  if ((existing[0]?.count ?? 0) > 0) {
    console.log('[shop-settings] setting_id=1 already exists; no changes made.');
    return;
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO shop_settings (
      setting_id,
      shop_name,
      latitude,
      longitude,
      delivery_start_time,
      delivery_deadline,
      max_orders_per_rider,
      rider_speed_kmh,
      box_sale_price,
      box_food_cost,
      rider_base_cost,
      rider_cost_per_km
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      DEFAULT_SHOP_SETTINGS.settingId,
      DEFAULT_SHOP_SETTINGS.shopName,
      DEFAULT_SHOP_SETTINGS.latitude,
      DEFAULT_SHOP_SETTINGS.longitude,
      DEFAULT_SHOP_SETTINGS.deliveryStartTime,
      DEFAULT_SHOP_SETTINGS.deliveryDeadline,
      DEFAULT_SHOP_SETTINGS.maxOrdersPerRider,
      DEFAULT_SHOP_SETTINGS.riderSpeedKmh,
      DEFAULT_SHOP_SETTINGS.boxSalePrice,
      DEFAULT_SHOP_SETTINGS.boxFoodCost,
      DEFAULT_SHOP_SETTINGS.riderBaseCost,
      DEFAULT_SHOP_SETTINGS.riderCostPerKm,
    ],
  );

  if (result.affectedRows !== 1) {
    throw new Error('shop_settings initialization did not insert setting_id=1.');
  }

  console.log('[shop-settings] initialized setting_id=1.');
}

main()
  .catch((error) => {
    console.error(`[shop-settings] initialization failed: ${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
