ALTER TABLE orders
  ADD COLUMN is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD INDEX idx_orders_simulated (is_simulated);
