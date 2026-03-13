-- Migration: Nouveau système de niveau estimé basé sur les résultats de match
-- Remplace l'ancien système de notation entre joueurs (match_ratings)

-- 1. Ajouter la colonne level_delta_applied à match_results
ALTER TABLE match_results
  ADD COLUMN IF NOT EXISTS level_delta_applied BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Supprimer l'ancien trigger community_level basé sur match_ratings
DROP TRIGGER IF EXISTS trigger_update_community_level ON match_ratings;
DROP FUNCTION IF EXISTS update_community_level();

-- 3. Fonction SECURITY DEFINER : applique les deltas de niveau estimé
--    Utilise UPDATE WHERE id IN (...) pour éviter les problèmes de FOREACH
CREATE OR REPLACE FUNCTION apply_match_level_deltas(p_match_result_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r           match_results%ROWTYPE;
  t1_weight   NUMERIC := 0;
  t2_weight   NUMERIC := 0;
  diff1       NUMERIC;
  diff2       NUMERIC;
  t1_delta    NUMERIC := 0;
  t2_delta    NUMERIC := 0;
  threshold   NUMERIC := 1.0;
BEGIN
  -- Charger le résultat
  SELECT * INTO r FROM match_results WHERE id = p_match_result_id;

  -- Sortir si pas trouvé, déjà appliqué ou pas de gagnant
  IF NOT FOUND THEN RETURN; END IF;
  IF r.level_delta_applied IS TRUE OR r.winner_team IS NULL THEN RETURN; END IF;

  -- Poids de la paire 1 (somme des niveaux déclarés)
  SELECT COALESCE(SUM(declared_level), 0) INTO t1_weight
  FROM profiles
  WHERE id IN (r.team1_player1_id, r.team1_player2_id)
    AND id IS NOT NULL;

  -- Poids de la paire 2
  SELECT COALESCE(SUM(declared_level), 0) INTO t2_weight
  FROM profiles
  WHERE id IN (r.team2_player1_id, r.team2_player2_id)
    AND id IS NOT NULL;

  diff1 := t2_weight - t1_weight;  -- positif = adversaire de t1 plus fort
  diff2 := t1_weight - t2_weight;  -- positif = adversaire de t2 plus fort

  -- Delta équipe 1
  IF r.winner_team = 1 THEN
    t1_delta := CASE
      WHEN diff1 > threshold  THEN 0.3
      WHEN diff1 >= -threshold THEN 0.1
      ELSE 0
    END;
  ELSE
    t1_delta := CASE
      WHEN diff1 > threshold  THEN 0
      WHEN diff1 >= -threshold THEN -0.1
      ELSE -0.3
    END;
  END IF;

  -- Delta équipe 2
  IF r.winner_team = 2 THEN
    t2_delta := CASE
      WHEN diff2 > threshold  THEN 0.3
      WHEN diff2 >= -threshold THEN 0.1
      ELSE 0
    END;
  ELSE
    t2_delta := CASE
      WHEN diff2 > threshold  THEN 0
      WHEN diff2 >= -threshold THEN -0.1
      ELSE -0.3
    END;
  END IF;

  -- Appliquer le delta à l'équipe 1 (les deux joueurs en une seule requête)
  UPDATE profiles
  SET community_level = ROUND(
    LEAST(10, GREATEST(1, COALESCE(community_level, declared_level, 1) + t1_delta))::numeric, 1
  )
  WHERE id IN (r.team1_player1_id, r.team1_player2_id)
    AND id IS NOT NULL;

  -- Appliquer le delta à l'équipe 2
  UPDATE profiles
  SET community_level = ROUND(
    LEAST(10, GREATEST(1, COALESCE(community_level, declared_level, 1) + t2_delta))::numeric, 1
  )
  WHERE id IN (r.team2_player1_id, r.team2_player2_id)
    AND id IS NOT NULL;

  -- Marquer comme appliqué pour éviter la double application
  UPDATE match_results SET level_delta_applied = TRUE WHERE id = p_match_result_id;
END;
$$;
