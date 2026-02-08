-- Migration pour ajouter firstname et lastname à la table Profiles
-- À exécuter dans la console SQL de Supabase

-- Ajouter les colonnes si elles n'existent pas
ALTER TABLE "Profiles"
ADD COLUMN IF NOT EXISTS firstname TEXT,
ADD COLUMN IF NOT EXISTS lastname TEXT;

-- Optionnel: Mettre à jour les profils existants avec des valeurs par défaut
-- UPDATE "Profiles" SET firstname = '', lastname = '' WHERE firstname IS NULL;
