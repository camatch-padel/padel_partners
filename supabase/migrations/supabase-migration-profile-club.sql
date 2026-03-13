-- Migration : Ajouter le club favori dans le profil utilisateur
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS court_id UUID REFERENCES courts(id) ON DELETE SET NULL;

