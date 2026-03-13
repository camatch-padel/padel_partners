-- Migration SQL pour créer les tables nécessaires à la gestion des parties
-- À exécuter dans la console SQL de Supabase

-- 1. Table courts (Clubs/Terrains)
CREATE TABLE IF NOT EXISTS courts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table groups (Groupes Privés)
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table group_members (Membres des groupes)
CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

-- 4. Table matches (Parties)
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time_slot TIME NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes IN (60, 90, 120)),
  format INTEGER NOT NULL CHECK (format IN (2, 4)),
  level_min DECIMAL(3,1) NOT NULL CHECK (level_min >= 1.0 AND level_min <= 10.0),
  level_max DECIMAL(3,1) NOT NULL CHECK (level_max >= 1.0 AND level_max <= 10.0),
  court_id UUID REFERENCES courts(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('tous', 'private')),
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'full', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Table match_participants (Participants aux parties)
CREATE TABLE IF NOT EXISTS match_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, user_id)
);

-- Création des index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(date);
CREATE INDEX IF NOT EXISTS idx_matches_creator ON matches(creator_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_visibility ON matches(visibility);
CREATE INDEX IF NOT EXISTS idx_participants_match ON match_participants(match_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON match_participants(user_id);

-- Activation de Row Level Security (RLS)
ALTER TABLE courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_participants ENABLE ROW LEVEL SECURITY;

-- Policies pour courts (lecture publique)
CREATE POLICY "Anyone can view courts" ON courts FOR SELECT USING (true);

-- Policies pour groups
CREATE POLICY "Anyone can view groups" ON groups FOR SELECT USING (true);
CREATE POLICY "Users can create groups" ON groups FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Creators can update their groups" ON groups FOR UPDATE USING (auth.uid() = creator_id);

-- Policies pour group_members
CREATE POLICY "Users can view group members" ON group_members FOR SELECT USING (true);
CREATE POLICY "Users can join groups" ON group_members FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policies pour matches
CREATE POLICY "Anyone can view public matches" ON matches FOR SELECT USING (visibility = 'tous');
CREATE POLICY "Group members can view private matches" ON matches
  FOR SELECT USING (
    visibility = 'private' AND
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );
CREATE POLICY "Users can create matches" ON matches FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Creators can update their matches" ON matches FOR UPDATE USING (auth.uid() = creator_id);

-- Policies pour match_participants
CREATE POLICY "Users can view participants" ON match_participants FOR SELECT USING (true);
CREATE POLICY "Users can join matches" ON match_participants FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Données de seed pour les clubs (8 clubs de test)
INSERT INTO courts (name, city, address) VALUES
  ('Padel Club Paris 15', 'Paris', '15 Rue de Vaugirard, 75015 Paris'),
  ('Green Padel Lyon', 'Lyon', '45 Cours Gambetta, 69007 Lyon'),
  ('Padel Riviera Nice', 'Nice', '10 Promenade des Anglais, 06000 Nice'),
  ('Urban Padel Toulouse', 'Toulouse', '22 Allée Jean Jaurès, 31000 Toulouse'),
  ('Padel Nation Marseille', 'Marseille', '8 Boulevard Charles Livon, 13007 Marseille'),
  ('Padel Center Bordeaux', 'Bordeaux', '12 Quai des Chartrons, 33000 Bordeaux'),
  ('Padel Arena Lille', 'Lille', '5 Boulevard de la Liberté, 59000 Lille'),
  ('Padel Sport Nantes', 'Nantes', '30 Rue de Strasbourg, 44000 Nantes')
ON CONFLICT DO NOTHING;

