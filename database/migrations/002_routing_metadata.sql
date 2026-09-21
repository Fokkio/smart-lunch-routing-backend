-- Additive routing metadata for generated plans (extends 001, no redesign).
ALTER TABLE route_plans
  ADD COLUMN routing_source VARCHAR(16) NULL,
  ADD COLUMN approximate BOOLEAN NULL DEFAULT FALSE;
ALTER TABLE delivery_jobs
  ADD COLUMN route_geometry JSON NULL;
