-- Migration: Supprimer les tables inutilisées
-- Date: 2026-02-09
-- Ces tables sont vides et ne sont référencées nulle part dans le code

-- Supprimer dans l'ordre pour respecter les foreign keys
DROP TABLE IF EXISTS "Match_reviews" CASCADE;
DROP TABLE IF EXISTS "Match_players" CASCADE;
DROP TABLE IF EXISTS "Matchs" CASCADE;
DROP TABLE IF EXISTS "club" CASCADE;
