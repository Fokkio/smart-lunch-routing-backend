-- 004: align rider_cost_per_km with the per-box delivery formula (Project.pdf):
-- delivery per job = rider_base_cost + route_km x rider_cost_per_km x boxes,
-- where the shop charges 2 THB per km per box.
-- Only rows still on the old default (4) are touched, so an intentionally
-- customized rate is never overwritten.
UPDATE shop_settings
SET rider_cost_per_km = 2
WHERE setting_id = 1 AND rider_cost_per_km = 4;
