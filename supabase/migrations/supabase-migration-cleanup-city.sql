-- Migration de nettoyage : suppression de la ville du profil et de la table cities
-- La géolocalisation se base désormais sur le GPS ou les coordonnées du club du joueur
-- À exécuter dans la console SQL de Supabase

-- ============================================
-- 1. Supprimer la colonne "city" de la table Profiles
-- ============================================
ALTER TABLE "Profiles" DROP COLUMN IF EXISTS city;

-- ============================================
-- 2. Supprimer la table "cities" (plus utilisée)
-- ============================================

-- Supprimer les policies RLS
DROP POLICY IF EXISTS "Anyone can view cities" ON cities;

-- Supprimer les index
DROP INDEX IF EXISTS idx_cities_name;
DROP INDEX IF EXISTS idx_cities_location;
DROP INDEX IF EXISTS idx_cities_population;
DROP INDEX IF EXISTS cities_name_location_unique;

-- Supprimer la table
DROP TABLE IF EXISTS cities;
