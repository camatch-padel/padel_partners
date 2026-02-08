-- Migration pour ajouter les avatars aux profils
-- À exécuter dans la console SQL de Supabase

-- 1. Ajouter la colonne avatar_url à la table Profiles
ALTER TABLE "Profiles"
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Créer le bucket storage pour les avatars (à faire via l'interface Supabase)
-- Nom du bucket: avatars
-- Public: true
-- Allowed MIME types: image/jpeg, image/png, image/webp
-- Max file size: 2MB

-- 3. Politique RLS pour le bucket avatars
-- Permettre à chaque utilisateur d'uploader son propre avatar
-- (À configurer via l'interface Supabase Storage)

-- 4. Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_profiles_avatar_url ON "Profiles"(avatar_url);
