-- ============================================
-- Migration : Ajout du push token Expo sur Profiles
-- ============================================

-- Ajouter la colonne expo_push_token à la table Profiles
ALTER TABLE "Profiles" ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

-- Index pour retrouver rapidement un profil par son token
CREATE INDEX IF NOT EXISTS idx_profiles_expo_push_token ON "Profiles" (expo_push_token) WHERE expo_push_token IS NOT NULL;
