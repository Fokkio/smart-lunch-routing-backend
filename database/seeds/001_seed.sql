-- ไฟล์นี้: ใส่ค่าตั้งร้านเริ่มต้น setting_id=1 ถ้ามีอยู่แล้วจะไม่ทับค่าของเดิม
-- รันด้วย: npx tsx scripts/run-sql.ts database/seeds/001_seed.sql
-- Default singleton settings for Smart Lunch Route.
-- Uses INSERT IGNORE so an existing production setting_id=1 is never overwritten.
INSERT IGNORE INTO shop_settings (
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
) VALUES (
  1,
  'Smart Lunch Shop',
  16.2463100,
  103.2528600,
  '11:30:00',
  '12:30:00',
  3,
  30.00,
  65.00,
  40.00,
  15.00,
  2.00
);
