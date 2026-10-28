-- ไฟล์นี้: เพิ่มคอลัมน์ metadata ของ routing ต่อจาก migration 001
-- รันด้วย: npm run db:migrate:routing
-- Additive routing metadata for generated plans (extends 001, no redesign).
-- route_plans: เพิ่มคอลัมน์บอกแหล่งที่มาของเส้นทางและว่าเป็นเส้นทางประมาณหรือไม่
ALTER TABLE route_plans
  ADD COLUMN routing_source VARCHAR(16) NULL,
  ADD COLUMN approximate BOOLEAN NULL DEFAULT FALSE;
-- delivery_jobs: เพิ่มคอลัมน์เก็บเส้นถนน (geometry) ของงานส่ง
ALTER TABLE delivery_jobs
  ADD COLUMN route_geometry JSON NULL;
