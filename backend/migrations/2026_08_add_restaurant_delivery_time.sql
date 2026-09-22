-- Adds an estimated total delivery time (prep + delivery, in minutes) per
-- restaurant, used by the Smart Food Finder feature's "maximum delivery
-- time" filter. Nullable and additive only — matches the pattern already
-- used for image_url. No existing data is touched, no other column is
-- affected.
--
-- This is a per-restaurant estimate (not live GPS tracking, and not
-- per-menu-item) since kitchen speed and typical delivery distance are
-- restaurant-level characteristics, not something that varies by dish.
--
-- Run once against your existing database:
--   mysql -u <user> -p <database> < migrations/2026_08_add_restaurant_delivery_time.sql

ALTER TABLE Restaurants
    ADD COLUMN avg_delivery_time_minutes INT NULL AFTER avg_rating;