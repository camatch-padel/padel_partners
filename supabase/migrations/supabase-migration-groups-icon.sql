-- Migration: Ajouter la colonne icon à la table groups
-- Date: 2026-02-08

-- Ajouter la colonne icon à la table groups
ALTER TABLE groups
ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT 'people';

-- Ajouter un commentaire pour documenter la colonne
COMMENT ON COLUMN groups.icon IS 'Nom de l''icône Ionicons pour le groupe (ex: people, star, trophy, etc.)';

-- Optionnel: Ajouter une contrainte pour valider que l'icône est dans la liste autorisée
-- (Décommentez si vous voulez une validation stricte au niveau de la base de données)
/*
ALTER TABLE groups
ADD CONSTRAINT groups_icon_check
CHECK (icon IN (
  'people', 'tennisball', 'trophy', 'star', 'flash',
  'rocket', 'shield', 'heart', 'flame', 'basketball',
  'football', 'american-football', 'baseball', 'golf',
  'ice-cream', 'pizza', 'beer', 'café', 'game-controller', 'headset'
));
*/
