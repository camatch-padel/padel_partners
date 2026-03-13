-- Migration: Ajouter une foreign key de group_messages vers profiles (FIXED)
-- Date: 2026-02-08
-- Permet de faire des jointures avec profiles pour récupérer les infos utilisateur

-- ============================================
-- 1. VÉRIFIER QUE profiles A UNE PRIMARY KEY
-- ============================================

-- S'assurer que profiles.id est bien une primary key
-- IMPORTANT: Utiliser 'profiles' avec des guillemets doubles pour préserver la casse
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'profiles_pkey' AND conrelid = 'public.profiles'::regclass
    ) THEN
        ALTER TABLE profiles ADD PRIMARY KEY (id);
    END IF;
END $$;

-- ============================================
-- 2. SUPPRIMER L'ANCIENNE CONTRAINTE SI ELLE EXISTE
-- ============================================

-- Supprimer la contrainte qui référence auth.users si elle existe
ALTER TABLE group_messages
DROP CONSTRAINT IF EXISTS group_messages_user_id_fkey;

-- ============================================
-- 3. AJOUTER LA NOUVELLE CONTRAINTE VERS profiles
-- ============================================

-- Ajouter la foreign key vers profiles au lieu de auth.users
-- Cela permet à Supabase de faire automatiquement les jointures
ALTER TABLE group_messages
ADD CONSTRAINT group_messages_user_id_fkey
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- ============================================
-- 4. CRÉER UN INDEX POUR LES PERFORMANCES
-- ============================================

-- Index sur user_id pour accélérer les jointures
CREATE INDEX IF NOT EXISTS idx_group_messages_user_id
ON group_messages(user_id);

-- Index composite pour les requêtes fréquentes (group + date)
CREATE INDEX IF NOT EXISTS idx_group_messages_group_created
ON group_messages(group_id, created_at DESC);

-- ============================================
-- 5. VÉRIFICATION
-- ============================================

-- Afficher les contraintes pour vérifier
DO $$
DECLARE
    constraint_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO constraint_count
    FROM pg_constraint
    WHERE conname = 'group_messages_user_id_fkey'
    AND conrelid = 'group_messages'::regclass;

    RAISE NOTICE 'Foreign key créée avec succès: %', constraint_count > 0;
END $$;

