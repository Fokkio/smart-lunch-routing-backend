-- Smart Lunch Route reference schema for a fresh database (TiDB/MySQL compatible).
-- This is an alternative to migrations 001-003, not a step to run before them.
-- In particular, is_simulated is already included here; migration 003 adds it
-- only to databases created from migration 001.
-- This file is intentionally idempotent and does not drop or seed data.

CREATE DATABASE IF NOT EXISTS smart_lunch_route
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE smart_lunch_route;

CREATE TABLE IF NOT EXISTS admin_users (
  admin_user_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(100) NOT NULL,
  display_name VARCHAR(150) NULL,
  password_hash VARCHAR(255) NOT NULL COMMENT 'bcrypt cost 10 hash only; never a plain-text password.',
  role ENUM('OWNER','ADMIN') NOT NULL DEFAULT 'OWNER',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (admin_user_id),
  UNIQUE KEY uq_admin_users_username (username),
  KEY idx_admin_users_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers (
  customer_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  address VARCHAR(500) NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (customer_id),
  UNIQUE KEY uq_customers_phone (phone),
  KEY idx_customers_name (name),
  KEY idx_customers_location (latitude, longitude),
  CONSTRAINT chk_customers_latitude CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT chk_customers_longitude CHECK (longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS riders (
  rider_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  rider_name VARCHAR(150) NOT NULL,
  username VARCHAR(100) NULL,
  phone VARCHAR(30) NULL,
  password_hash VARCHAR(255) NULL COMMENT 'bcrypt cost 10; null until owner sets a password.',
  login_enabled TINYINT(1) NOT NULL DEFAULT 1,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('ACTIVE','INACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (rider_id),
    UNIQUE KEY uq_riders_username (username),
  UNIQUE KEY uq_riders_phone (phone),
  KEY idx_riders_available (is_available, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  order_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NOT NULL,
  order_date DATE NOT NULL,
  box_count INT UNSIGNED NOT NULL,
  status ENUM('PENDING','PLANNED','ASSIGNED','DELIVERING','DELIVERED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  delivery_deadline TIME NOT NULL DEFAULT '12:30:00',
  assigned_at DATETIME NULL,
  delivered_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  is_simulated TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (order_id),
  KEY idx_orders_customer (customer_id),
  KEY idx_orders_status_date (status, order_date),
  KEY idx_orders_date_id (order_date, order_id),
  KEY idx_orders_simulated (is_simulated),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers (customer_id),
  CONSTRAINT chk_orders_box_count CHECK (box_count BETWEEN 1 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_settings (
  stop_service_minutes INT NOT NULL DEFAULT 0,
  setting_id TINYINT UNSIGNED NOT NULL,
  shop_name VARCHAR(150) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  delivery_start_time TIME NOT NULL DEFAULT '11:30:00',
  delivery_deadline TIME NOT NULL DEFAULT '12:30:00',
  max_orders_per_rider INT UNSIGNED NOT NULL DEFAULT 3,
  rider_speed_kmh DECIMAL(6,2) NOT NULL DEFAULT 30.00,
  box_sale_price DECIMAL(10,2) NOT NULL DEFAULT 65.00,
  box_food_cost DECIMAL(10,2) NOT NULL DEFAULT 40.00,
  rider_base_cost DECIMAL(10,2) NOT NULL DEFAULT 15.00,
  rider_cost_per_km DECIMAL(10,2) NOT NULL DEFAULT 2.00,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_id),
  CONSTRAINT chk_shop_settings_singleton CHECK (setting_id = 1),
  CONSTRAINT chk_shop_settings_latitude CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT chk_shop_settings_longitude CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT chk_shop_settings_max_orders CHECK (max_orders_per_rider > 0),
  CONSTRAINT chk_shop_settings_speed CHECK (rider_speed_kmh > 0),
  CONSTRAINT chk_shop_settings_prices CHECK (box_sale_price >= 0 AND box_food_cost >= 0 AND rider_base_cost >= 0 AND rider_cost_per_km >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS route_plans (
  input_snapshot JSON NULL,
  route_plan_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  plan_date DATE NOT NULL,
  start_time TIME NOT NULL,
  estimated_finish_time TIME NULL,
  rider_count INT UNSIGNED NULL,
  total_distance_km DECIMAL(10,2) NULL,
  total_delivery_cost DECIMAL(10,2) NULL,
  total_revenue DECIMAL(10,2) NULL,
  total_food_cost DECIMAL(10,2) NULL,
  estimated_profit DECIMAL(10,2) NULL,
  status ENUM('GENERATED','SELECTED','REJECTED') NOT NULL DEFAULT 'GENERATED',
  routing_source ENUM('ROAD','HAVERSINE') NULL,
  approximate TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (route_plan_id),
  KEY idx_route_plans_date_status (plan_date, status),
  KEY idx_route_plans_status (status),
  CONSTRAINT chk_route_plans_nonnegative_totals CHECK (
    (total_distance_km IS NULL OR total_distance_km >= 0) AND
    (total_delivery_cost IS NULL OR total_delivery_cost >= 0) AND
    (total_revenue IS NULL OR total_revenue >= 0) AND
    (total_food_cost IS NULL OR total_food_cost >= 0)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS delivery_jobs (
  acknowledged_at DATETIME NULL, assigned_at DATETIME NULL,
  delivery_job_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  route_plan_id INT UNSIGNED NOT NULL,
  rider_id INT UNSIGNED NULL,
  job_code VARCHAR(50) NOT NULL COMMENT 'Rider-facing job code used by the mobile job sheet flow.',
  total_orders INT UNSIGNED NOT NULL DEFAULT 0,
  total_boxes INT UNSIGNED NOT NULL DEFAULT 0,
  total_distance_km DECIMAL(10,2) NULL,
  estimated_duration_min INT UNSIGNED NULL,
  estimated_start_time TIME NULL,
  estimated_finish_time TIME NULL,
  delivery_cost DECIMAL(10,2) NULL,
  route_geometry JSON NULL COMMENT 'GeoJSON LineString from shop to ordered stops; coordinates are [lng, lat].',
  status ENUM('WAITING','DELIVERING','COMPLETED') NOT NULL DEFAULT 'WAITING',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (delivery_job_id),
  UNIQUE KEY uq_delivery_jobs_job_code (job_code),
  KEY idx_delivery_jobs_route_plan (route_plan_id),
  KEY idx_delivery_jobs_rider_status (rider_id, status),
  CONSTRAINT fk_delivery_jobs_route_plan FOREIGN KEY (route_plan_id) REFERENCES route_plans (route_plan_id) ON DELETE CASCADE,
  CONSTRAINT fk_delivery_jobs_rider FOREIGN KEY (rider_id) REFERENCES riders (rider_id) ON DELETE RESTRICT,
  CONSTRAINT chk_delivery_jobs_totals CHECK (total_orders BETWEEN 0 AND 3 AND total_boxes >= 0),
  CONSTRAINT chk_delivery_jobs_distance_cost CHECK (
    (total_distance_km IS NULL OR total_distance_km >= 0) AND
    (estimated_duration_min IS NULL OR estimated_duration_min >= 0) AND
    (delivery_cost IS NULL OR delivery_cost >= 0)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS delivery_job_orders (
  delivery_job_order_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  delivery_job_id INT UNSIGNED NOT NULL,
  order_id INT UNSIGNED NOT NULL,
  stop_sequence INT UNSIGNED NOT NULL,
  distance_from_previous_km DECIMAL(10,2) NULL,
  travel_time_from_previous_min INT UNSIGNED NULL,
  estimated_arrival_time TIME NULL,
  leg_geometry JSON NULL COMMENT 'Road geometry from previous stop or shop to this order.',
  arrived_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (delivery_job_order_id),
  UNIQUE KEY uq_delivery_job_orders_sequence (delivery_job_id, stop_sequence),
  UNIQUE KEY uq_delivery_job_orders_order (delivery_job_id, order_id),
  KEY idx_delivery_job_orders_order (order_id),
  CONSTRAINT fk_delivery_job_orders_job FOREIGN KEY (delivery_job_id) REFERENCES delivery_jobs (delivery_job_id) ON DELETE CASCADE,
  CONSTRAINT fk_delivery_job_orders_order FOREIGN KEY (order_id) REFERENCES orders (order_id),
  CONSTRAINT chk_delivery_job_orders_sequence CHECK (stop_sequence > 0),
  CONSTRAINT chk_delivery_job_orders_leg CHECK (
    (distance_from_previous_km IS NULL OR distance_from_previous_km >= 0) AND
    (travel_time_from_previous_min IS NULL OR travel_time_from_previous_min >= 0)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  actor_type ENUM('OWNER','RIDER') NOT NULL,
  actor_id INT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_auth_sessions_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_login_attempts (
  subject_hash CHAR(64) NOT NULL PRIMARY KEY,
  failed_count INT NOT NULL DEFAULT 0,
  window_started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  blocked_until DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
