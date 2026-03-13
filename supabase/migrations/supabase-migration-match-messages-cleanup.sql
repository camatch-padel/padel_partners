-- Migration: Nettoyer et recréer la table match_messages
-- Date: 2026-02-08
-- Supprime l'ancienne version et recrée proprement

-- ============================================
-- 1. SUPPRIMER LES POLITIQUES EXISTANTES
-- ============================================

DROP POLICY IF EXISTS "Users can view messages in accessible matches" ON match_messages;
DROP POLICY IF EXISTS "Users can send messages in accessible matches" ON match_messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON match_messages;
DROP POLICY IF EXISTS "Match creators can delete any message" ON match_messages;

-- ============================================
-- 2. SUPPRIMER LES FONCTIONS HELPER
-- ============================================

DROP FUNCTION IF EXISTS is_match_public(UUID);
DROP FUNCTION IF EXISTS can_access_private_match(UUID, UUID);
DROP FUNCTION IF EXISTS can_access_private_match(UUID);

-- ============================================
-- 3. SUPPRIMER LA TABLE
-- ============================================

DROP TABLE IF EXISTS match_messages CASCADE;

-- ============================================
-- 4. RECRÉER LA TABLE
-- ============================================

CREATE TABLE match_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE match_messages IS 'Messages dans les chats des parties';

-- ============================================
-- 5. CRÉER LES INDEX
-- ============================================

CREATE INDEX idx_match_messages_match_id_created_at
ON match_messages(match_id, created_at DESC);

CREATE INDEX idx_match_messages_user_id
ON match_messages(user_id);

-- ============================================
-- 6. ACTIVER RLS
-- ============================================

ALTER TABLE match_messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 7. CRÉER LES FONCTIONS HELPER
-- ============================================

-- Fonction helper pour vérifier si un match est public
CREATE FUNCTION is_match_public(match_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM matches
    WHERE id = match_uuid AND visibility = 'tous'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction helper pour vérifier si un utilisateur a accès à un match privé
CREATE FUNCTION can_access_private_match(match_uuid UUID, user_uuid UUID DEFAULT auth.uid())
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

-- ============================================
-- 8. CRÉER LES POLITIQUES RLS
-- ============================================

-- Politique SELECT : Voir les messages
CREATE POLICY "Users can view messages in accessible matches"
ON match_messages FOR SELECT TO authenticated
USING (
  is_match_public(match_id) OR can_access_private_match(match_id)
);

-- Politique INSERT : Envoyer des messages
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
-- 9. VÉRIFICATION
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '✅ Table match_messages nettoyée et recréée avec succès';
    RAISE NOTICE '✅ Index créés pour les performances';
    RAISE NOTICE '✅ RLS activé avec politiques pour public/privé';
END $$;

