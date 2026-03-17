-- Migration : Suppression de level_max dans matches
-- La logique d'accès repose désormais uniquement sur level_min :
--   - Si declared_level ET community_level >= level_min → accès direct
--   - Si l'un des deux est en dessous → demande au créateur

-- Supprimer la contrainte check_level_range (référence level_max)
ALTER TABLE matches DROP CONSTRAINT IF EXISTS check_level_range;

-- Supprimer la contrainte check_level_max
ALTER TABLE matches DROP CONSTRAINT IF EXISTS check_level_max;

-- Supprimer la colonne level_max
ALTER TABLE matches DROP COLUMN IF EXISTS level_max;
