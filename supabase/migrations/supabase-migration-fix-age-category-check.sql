-- Fix : recréer la contrainte age_category alignée avec le code
-- À exécuter dans la console SQL de Supabase

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_age_category_check;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_age_category_check
  CHECK (age_category IN ('9/10ans', '11/12ans', '13/14ans', '15/16ans', '17/18ans', 'Senior', '+45ans', '+55ans'));
