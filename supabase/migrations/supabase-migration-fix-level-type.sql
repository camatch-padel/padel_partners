-- Fix : changer le type de declared_level de smallint à decimal
-- pour supporter les niveaux décimaux (ex: 6.5)
-- À exécuter dans la console SQL de Supabase

ALTER TABLE profiles
ALTER COLUMN declared_level TYPE DECIMAL(3,1) USING declared_level::DECIMAL(3,1);

