-- Migration: Créer la table pour les messages des parties
-- Date: 2026-02-08
-- Permet d'ajouter un chat sur chaque partie (publique ou privée)

-- ============================================
-- 1. CRÉER LA TABLE match_messages
-- ============================================

CREATE TABLE IF NOT EXISTS match_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 2. CRÉER LES INDEX POUR LES PERFORMANCES
-- ============================================

-- Index pour charger les messages d'un match
CREATE INDEX IF NOT EXISTS idx_match_messages_match_id_created_at
ON match_messages(match_id, created_at DESC);

-- Index pour les recherches par utilisateur
CREATE INDEX IF NOT EXISTS idx_match_messages_user_id
ON match_messages(user_id);

-- ============================================
-- 3. AJOUTER LA FOREIGN KEY VERS PROFILES
-- ============================================

-- Ajouter la foreign key vers Profiles pour les jointures automatiques
ALTER TABLE match_messages
ADD CONSTRAINT match_messages_user_id_fkey_profiles
FOREIGN KEY (user_id) REFERENCES "Profiles"(id) ON DELETE CASCADE;

COMMENT ON TABLE match_messages IS 'Messages dans les chats des parties';

-- ============================================
-- 4. ACTIVER RLS
-- ============================================

ALTER TABLE match_messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. POLITIQUES RLS
-- ============================================

-- Fonction helper pour vérifier si un match est public
CREATE OR REPLACE FUNCTION is_match_public(match_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM matches
    WHERE id = match_uuid AND visibility = 'public'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction helper pour vérifier si un utilisateur a accès à un match privé
CREATE OR REPLACE FUNCTION can_access_private_match(match_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  -- Vérifier si l'utilisateur est membre du groupe associé au match
  RETURN EXISTS (
    SELECT 1 FROM matches m
    JOIN group_members gm ON gm.group_id = m.group_id
    WHERE m.id = match_uuid
    AND m.visibility = 'private'
    AND gm.user_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Politique SELECT : Voir les messages
-- - Si match public : tout le monde
-- - Si match privé : seulement les membres du groupe
CREATE POLICY "Users can view messages in accessible matches"
ON match_messages FOR SELECT TO authenticated
USING (
  is_match_public(match_id) OR can_access_private_match(match_id)
);

-- Politique INSERT : Envoyer des messages
-- - Si match public : tout utilisateur authentifié
-- - Si match privé : seulement les membres du groupe
CREATE POLICY "Users can send messages in accessible matches"
ON match_messages FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (is_match_public(match_id) OR can_access_private_match(match_id))
);

-- Politique DELETE : Supprimer ses propres messages
CREATE POLICY "Users can delete their own messages"
ON match_messages FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Politique DELETE : Créateur du match peut supprimer n'importe quel message
CREATE POLICY "Match creators can delete any message"
ON match_messages FOR DELETE TO authenticated
USING (
  match_id IN (
    SELECT id FROM matches WHERE creator_id = auth.uid()
  )
);

-- ============================================
-- 6. VÉRIFICATION
-- ============================================

-- Afficher un résumé
DO $$
BEGIN
    RAISE NOTICE '✅ Table match_messages créée avec succès';
    RAISE NOTICE '✅ Index créés pour les performances';
    RAISE NOTICE '✅ RLS activé avec politiques pour public/privé';
END $$;
