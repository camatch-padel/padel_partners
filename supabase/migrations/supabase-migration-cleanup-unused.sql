-- Migration : Nettoyage des colonnes et tables inutilisées avant production

-- 1. Supprimer la colonne community_level_votes de profiles
--    (remplacée par le système de niveau basé sur les résultats de match)
ALTER TABLE profiles
  DROP COLUMN IF EXISTS community_level_votes;

-- 2. Supprimer la colonne match_played de profiles
--    (jamais incrémentée ni lue par l'application)
ALTER TABLE profiles
  DROP COLUMN IF EXISTS match_played;

-- 3. Supprimer la table match_ratings et son trigger
--    (remplacée par la fonction apply_match_level_deltas)
DO $$ BEGIN
  DROP TRIGGER IF EXISTS trigger_update_community_level ON match_ratings;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DROP FUNCTION IF EXISTS update_community_level();
DROP TABLE IF EXISTS match_ratings;
