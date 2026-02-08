-- Fix cities table to allow duplicate names
-- Drop the unique constraint on name and add a unique constraint on name+latitude+longitude

-- 1. Drop the existing unique constraint
ALTER TABLE cities DROP CONSTRAINT IF EXISTS cities_name_key;

-- 2. Create a unique constraint on name + coordinates instead
-- This allows cities with the same name but different locations
CREATE UNIQUE INDEX IF NOT EXISTS cities_name_location_unique 
ON cities (name, latitude, longitude);
