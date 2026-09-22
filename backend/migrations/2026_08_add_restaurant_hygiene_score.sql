-- Adds a hygiene / food-safety score (0-100) per restaurant, shown on
-- restaurant cards and the menu/details page. Nullable and additive only —
-- matches the pattern already used for image_url and
-- avg_delivery_time_minutes. No existing data is touched, no other column
-- is affected.
--
-- IMPORTANT: values seeded via seedDemoData.js are DEMO scores for this
-- college project, not real inspection results from any health authority.
-- The frontend must not present them as official government data — see
-- RestaurantListPage.jsx / RestaurantMenuPage.jsx for the disclaimer text
-- shown alongside every score.
--
-- Deliberately NOT exposed as an owner-editable field in
-- restaurantController.js's updateRestaurant — a self-assignable food
-- safety score would defeat its entire purpose. Same treatment as
-- commission_rate.
--
-- CHECK constraint requires MySQL 8.0.16+ (or MariaDB 10.2+) to actually
-- be enforced; on older versions it's silently accepted but not enforced,
-- which is harmless here since the seed script and controller both only
-- ever write validated 0-100 values regardless.
--
-- Run once against your existing database:
--   mysql -u <user> -p <database> < migrations/2026_08_add_restaurant_hygiene_score.sql

ALTER TABLE Restaurants
    ADD COLUMN hygiene_score TINYINT UNSIGNED NULL AFTER avg_delivery_time_minutes,
    ADD CONSTRAINT chk_hygiene_score_range CHECK (hygiene_score IS NULL OR hygiene_score BETWEEN 0 AND 100);