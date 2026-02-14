-- Migration : Ajouter le club favori dans le profil utilisateur
ALTER TABLE "Profiles" ADD COLUMN IF NOT EXISTS court_id UUID REFERENCES courts(id) ON DELETE SET NULL;
