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
  4.00
);
