-- Migration pour ajouter firstname et lastname à la table profiles
-- À exécuter dans la console SQL de Supabase

-- Ajouter les colonnes si elles n'existent pas
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS firstname TEXT,
ADD COLUMN IF NOT EXISTS lastname TEXT;

-- Optionnel: Mettre à jour les profils existants avec des valeurs par défaut
-- UPDATE profiles SET firstname = '', lastname = '' WHERE firstname IS NULL;

