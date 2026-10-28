-- ไฟล์นี้: เพิ่มคอลัมน์ leg_geometry เก็บเส้นถนนจริงของแต่ละจุดส่ง
-- รันด้วย: npx tsx scripts/run-sql.ts database/migrations/005_order_route_geometry.sql
-- Exact road leg for each order: previous stop (or shop) to this stop.
ALTER TABLE delivery_job_orders ADD COLUMN leg_geometry JSON NULL;
