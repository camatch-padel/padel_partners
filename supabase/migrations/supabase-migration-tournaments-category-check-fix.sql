-- Migration: Fix tournaments category check constraint
-- Date: 2026-02-14
-- Objectif: aligner la contrainte SQL avec les valeurs utilisées par l'app

BEGIN;

-- Supprimer l'ancienne contrainte si elle existe
ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_category_check;

-- Recréer une contrainte compatible (P250 uniquement, pas de P200)
ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_category_check
  CHECK (category IN ('P25', 'P50', 'P100', 'P250', 'P500', 'P1000', 'P2000'));

COMMIT;
