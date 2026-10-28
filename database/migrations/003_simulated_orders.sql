-- ไฟล์นี้: เพิ่มคอลัมน์ is_simulated ให้ตาราง orders เพื่อแยกออเดอร์จำลองออกจากออเดอร์จริง
-- รันด้วย: npm run db:migrate:simulation
ALTER TABLE orders
  ADD COLUMN is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD INDEX idx_orders_simulated (is_simulated);
