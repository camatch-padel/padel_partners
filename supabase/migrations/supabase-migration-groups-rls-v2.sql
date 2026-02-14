-- Migration: Ajouter les politiques RLS pour les groupes (Version 2 - Safe)
-- Date: 2026-02-08
-- Cette version supprime les politiques existantes avant de les recréer

-- ============================================
-- 1. ACTIVER RLS SUR LES TABLES GROUPES
-- ============================================

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. SUPPRIMER LES POLITIQUES EXISTANTES
-- ============================================

-- Supprimer les anciennes politiques si elles existent
DROP POLICY IF EXISTS "Users can view groups they are members of" ON groups;
DROP POLICY IF EXISTS "Users can create groups" ON groups;
DROP POLICY IF EXISTS "Creators can update their groups" ON groups;
DROP POLICY IF EXISTS "Creators can delete their groups" ON groups;

DROP POLICY IF EXISTS "Members can view members of their groups" ON group_members;
DROP POLICY IF EXISTS "Group creators can add members" ON group_members;
DROP POLICY IF EXISTS "Group creators can remove members" ON group_members;
DROP POLICY IF EXISTS "Members can leave groups (except creators)" ON group_members;

DROP POLICY IF EXISTS "Members can view messages in their groups" ON group_messages;
DROP POLICY IF EXISTS "Members can send messages in their groups" ON group_messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON group_messages;
DROP POLICY IF EXISTS "Group creators can delete any message" ON group_messages;

-- ============================================
-- 3. POLITIQUES POUR LA TABLE groups
-- ============================================

CREATE POLICY "Users can view groups they are members of"
ON groups FOR SELECT TO authenticated
USING (
  id IN (
    SELECT group_id FROM group_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create groups"
ON groups FOR INSERT TO authenticated
WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Creators can update their groups"
ON groups FOR UPDATE TO authenticated
USING (creator_id = auth.uid())
WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Creators can delete their groups"
ON groups FOR DELETE TO authenticated
USING (creator_id = auth.uid());

-- ============================================
-- 4. POLITIQUES POUR LA TABLE group_members
-- ============================================

CREATE POLICY "Members can view members of their groups"
ON group_members FOR SELECT TO authenticated
USING (
  group_id IN (
    SELECT group_id FROM group_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Group creators can add members"
ON group_members FOR INSERT TO authenticated
WITH CHECK (
  group_id IN (
    SELECT id FROM groups WHERE creator_id = auth.uid()
  )
);

CREATE POLICY "Group creators can remove members"
ON group_members FOR DELETE TO authenticated
USING (
  group_id IN (
    SELECT id FROM groups WHERE creator_id = auth.uid()
  )
  AND user_id != auth.uid()
);

CREATE POLICY "Members can leave groups (except creators)"
ON group_members FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  AND group_id NOT IN (
    SELECT id FROM groups WHERE creator_id = auth.uid()
  )
);

-- ============================================
-- 5. POLITIQUES POUR LA TABLE group_messages
-- ============================================

CREATE POLICY "Members can view messages in their groups"
ON group_messages FOR SELECT TO authenticated
USING (
  group_id IN (
    SELECT group_id FROM group_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Members can send messages in their groups"
ON group_messages FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND group_id IN (
    SELECT group_id FROM group_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own messages"
ON group_messages FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Group creators can delete any message"
ON group_messages FOR DELETE TO authenticated
USING (
  group_id IN (
    SELECT id FROM groups WHERE creator_id = auth.uid()
  )
);
