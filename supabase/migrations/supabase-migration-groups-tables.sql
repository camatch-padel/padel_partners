-- Migration: Créer les tables pour les groupes
-- Date: 2026-02-08
-- À exécuter AVANT supabase-migration-groups-rls.sql

-- ============================================
-- 1. CRÉER LA TABLE groups (si elle n'existe pas déjà)
-- ============================================

-- Si la table existe déjà, juste ajouter la colonne icon
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'groups') THEN
        -- La table existe, juste ajouter la colonne icon si elle n'existe pas
        ALTER TABLE groups ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT 'people';
    ELSE
        -- Créer la table complète
        CREATE TABLE groups (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            description TEXT,
            icon TEXT NOT NULL DEFAULT 'people',
            creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Créer un index sur creator_id
        CREATE INDEX idx_groups_creator_id ON groups(creator_id);
    END IF;
END $$;

-- Ajouter un commentaire sur la colonne icon
COMMENT ON COLUMN groups.icon IS 'Nom de l''icône Ionicons pour le groupe';

-- ============================================
-- 2. CRÉER LA TABLE group_members
-- ============================================

CREATE TABLE IF NOT EXISTS group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(group_id, user_id)  -- Un utilisateur ne peut être membre qu'une seule fois
);

-- Index pour les recherches fréquentes
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);

COMMENT ON TABLE group_members IS 'Membres des groupes privés';

-- ============================================
-- 3. CRÉER LA TABLE group_messages
-- ============================================

CREATE TABLE IF NOT EXISTS group_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour trier les messages par date
CREATE INDEX IF NOT EXISTS idx_group_messages_group_id_created_at
ON group_messages(group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_group_messages_user_id ON group_messages(user_id);

COMMENT ON TABLE group_messages IS 'Messages dans les groupes privés';

-- ============================================
-- 4. FONCTION POUR METTRE À JOUR updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer le trigger pour la table groups
DROP TRIGGER IF EXISTS update_groups_updated_at ON groups;
CREATE TRIGGER update_groups_updated_at
    BEFORE UPDATE ON groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
