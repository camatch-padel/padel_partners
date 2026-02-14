-- Migration: Ajouter les politiques RLS pour les groupes (Version 3 - Fixed Recursion)
-- Date: 2026-02-08
-- Cette version corrige la récursion infinie dans les politiques

-- ============================================
-- 1. ACTIVER RLS SUR LES TABLES GROUPES
-- ============================================

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. SUPPRIMER LES POLITIQUES EXISTANTES
-- ============================================

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
-- 3. FONCTIONS HELPER POUR ÉVITER LA RÉCURSION
-- ============================================

-- Fonction pour vérifier si un utilisateur est membre d'un groupe
-- SECURITY DEFINER permet de bypasser RLS pour éviter la récursion
CREATE OR REPLACE FUNCTION is_group_member(group_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = group_uuid AND user_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour vérifier si un utilisateur est créateur d'un groupe
CREATE OR REPLACE FUNCTION is_group_creator(group_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM groups
    WHERE id = group_uuid AND creator_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. POLITIQUES POUR LA TABLE groups
-- ============================================

CREATE POLICY "Users can view groups they are members of"
ON groups FOR SELECT TO authenticated
USING (is_group_member(id));

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
-- 5. POLITIQUES POUR LA TABLE group_members
-- ============================================

-- Permet de voir les membres des groupes dont on fait partie
CREATE POLICY "Members can view members of their groups"
ON group_members FOR SELECT TO authenticated
USING (is_group_member(group_id));

-- Permet aux créateurs d'ajouter des membres
CREATE POLICY "Group creators can add members"
ON group_members FOR INSERT TO authenticated
WITH CHECK (is_group_creator(group_id));

-- Permet aux créateurs de supprimer des membres (sauf eux-mêmes)
CREATE POLICY "Group creators can remove members"
ON group_members FOR DELETE TO authenticated
USING (is_group_creator(group_id) AND user_id != auth.uid());

-- Permet aux membres de quitter un groupe (sauf s'ils sont créateurs)
CREATE POLICY "Members can leave groups (except creators)"
ON group_members FOR DELETE TO authenticated
USING (user_id = auth.uid() AND NOT is_group_creator(group_id));

-- ============================================
-- 6. POLITIQUES POUR LA TABLE group_messages
-- ============================================

CREATE POLICY "Members can view messages in their groups"
ON group_messages FOR SELECT TO authenticated
USING (is_group_member(group_id));

CREATE POLICY "Members can send messages in their groups"
ON group_messages FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND is_group_member(group_id));

CREATE POLICY "Users can delete their own messages"
ON group_messages FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Group creators can delete any message"
ON group_messages FOR DELETE TO authenticated
USING (is_group_creator(group_id));
