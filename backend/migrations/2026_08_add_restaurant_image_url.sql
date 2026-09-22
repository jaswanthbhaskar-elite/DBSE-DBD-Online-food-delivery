-- Adds an optional restaurant photo field, matching the image_url column
-- MenuItems already has. Nullable and additive only — no existing data is
-- touched, no other column is affected, and every existing SELECT/INSERT
-- statement elsewhere in the codebase keeps working unchanged.
--
-- Run once against your existing database:
--   mysql -u <user> -p <database> < migrations/2026_08_add_restaurant_image_url.sql

ALTER TABLE Restaurants
    ADD COLUMN image_url VARCHAR(500) NULL AFTER avg_rating;