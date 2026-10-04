-- Exact road leg for each order: previous stop (or shop) to this stop.
ALTER TABLE delivery_job_orders ADD COLUMN leg_geometry JSON NULL;
