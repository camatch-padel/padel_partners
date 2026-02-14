-- Migration: Ajouter les politiques RLS pour les groupes
-- Date: 2026-02-08

-- ============================================
-- 1. ACTIVER RLS SUR LES TABLES GROUPES
-- ============================================

-- Activer RLS sur la table groups
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- Activer RLS sur la table group_members
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- Activer RLS sur la table group_messages
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. POLITIQUES POUR LA TABLE groups
-- ============================================

-- Permettre à tous les utilisateurs authentifiés de lire les groupes dont ils sont membres
CREATE POLICY "Users can view groups they are members of"
ON groups
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT group_id
    FROM group_members
    WHERE user_id = auth.uid()
  )
);

-- Permettre aux utilisateurs authentifiés de créer des groupes
CREATE POLICY "Users can create groups"
ON groups
FOR INSERT
TO authenticated
WITH CHECK (creator_id = auth.uid());

-- Permettre aux créateurs de mettre à jour leurs groupes
CREATE POLICY "Creators can update their groups"
ON groups
FOR UPDATE
TO authenticated
USING (creator_id = auth.uid())
WITH CHECK (creator_id = auth.uid());

-- Permettre aux créateurs de supprimer leurs groupes
CREATE POLICY "Creators can delete their groups"
ON groups
FOR DELETE
TO authenticated
USING (creator_id = auth.uid());

-- ============================================
-- 3. POLITIQUES POUR LA TABLE group_members
-- ============================================

-- Permettre aux membres de voir les membres des groupes auxquels ils appartiennent
CREATE POLICY "Members can view members of their groups"
ON group_members
FOR SELECT
TO authenticated
USING (
  group_id IN (
    SELECT group_id
    FROM group_members
    WHERE user_id = auth.uid()
  )
);

-- Permettre aux créateurs de groupes d'ajouter des membres
CREATE POLICY "Group creators can add members"
ON group_members
FOR INSERT
TO authenticated
WITH CHECK (
  group_id IN (
    SELECT id
    FROM groups
    WHERE creator_id = auth.uid()
  )
);

-- Permettre aux créateurs de groupes de supprimer des membres (sauf eux-mêmes)
CREATE POLICY "Group creators can remove members"
ON group_members
FOR DELETE
TO authenticated
USING (
  group_id IN (
    SELECT id
    FROM groups
    WHERE creator_id = auth.uid()
  )
  AND user_id != auth.uid()  -- Ne peut pas se supprimer lui-même
);

-- Permettre aux membres de quitter un groupe (se supprimer eux-mêmes)
-- SAUF s'ils sont le créateur
CREATE POLICY "Members can leave groups (except creators)"
ON group_members
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND group_id NOT IN (
    SELECT id
    FROM groups
    WHERE creator_id = auth.uid()
  )
);

-- ============================================
-- 4. POLITIQUES POUR LA TABLE group_messages
-- ============================================

-- Permettre aux membres de voir les messages de leurs groupes
CREATE POLICY "Members can view messages in their groups"
ON group_messages
FOR SELECT
TO authenticated
USING (
  group_id IN (
    SELECT group_id
    FROM group_members
    WHERE user_id = auth.uid()
  )
);

-- Permettre aux membres d'envoyer des messages dans leurs groupes
CREATE POLICY "Members can send messages in their groups"
ON group_messages
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND group_id IN (
    SELECT group_id
    FROM group_members
    WHERE user_id = auth.uid()
  )
);

-- Permettre aux utilisateurs de supprimer leurs propres messages
CREATE POLICY "Users can delete their own messages"
ON group_messages
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Permettre aux créateurs de groupes de supprimer n'importe quel message
CREATE POLICY "Group creators can delete any message"
ON group_messages
FOR DELETE
TO authenticated
USING (
  group_id IN (
    SELECT id
    FROM groups
    WHERE creator_id = auth.uid()
  )
);

-- ============================================
-- 5. INDEX POUR AMÉLIORER LES PERFORMANCES
-- ============================================

-- Index sur group_members pour les recherches fréquentes
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);

-- Index sur group_messages pour le tri par date
CREATE INDEX IF NOT EXISTS idx_group_messages_group_id_created_at
ON group_messages(group_id, created_at DESC);

-- Index sur groups pour le créateur
CREATE INDEX IF NOT EXISTS idx_groups_creator_id ON groups(creator_id);
