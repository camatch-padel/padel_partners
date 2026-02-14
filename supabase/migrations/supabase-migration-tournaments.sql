-- Migration : Tables pour la recherche de partenaire de tournoi

-- Table principale des recherches de partenaire
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES "Profiles"(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time_slot TEXT,
  category TEXT NOT NULL CHECK (category IN ('P25', 'P50', 'P100', 'P250', 'P500', 'P1000', 'P2000')),
  event_type TEXT NOT NULL CHECK (event_type IN ('Mixte', 'Femme', 'Homme')),
  age_category TEXT NOT NULL CHECK (age_category IN ('9/10ans', '11/12ans', '13/14ans', '15/16ans', '17/18ans', 'Senior', '+45ans', '+55ans')),
  min_ranking INTEGER NOT NULL DEFAULT 0 CHECK (min_ranking >= 0 AND min_ranking <= 999999),
  player_position TEXT NOT NULL CHECK (player_position IN ('Droite', 'Gauche', 'Peu importe')),
  court_id UUID REFERENCES courts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'searching' CHECK (status IN ('searching', 'partner_found', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table des demandes de partenariat
CREATE TABLE IF NOT EXISTS tournament_demands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES "Profiles"(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tournament_id, user_id)
);

-- Table des messages
CREATE TABLE IF NOT EXISTS tournament_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES "Profiles"(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_tournaments_creator ON tournaments(creator_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_date ON tournaments(date);
CREATE INDEX IF NOT EXISTS idx_tournament_demands_tournament ON tournament_demands(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_demands_user ON tournament_demands(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_messages_tournament ON tournament_messages(tournament_id);

-- RLS
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_demands ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_messages ENABLE ROW LEVEL SECURITY;

-- Policies pour tournaments
CREATE POLICY "Tournaments are viewable by everyone"
  ON tournaments FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own tournaments"
  ON tournaments FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Users can update their own tournaments"
  ON tournaments FOR UPDATE
  USING (auth.uid() = creator_id);

CREATE POLICY "Users can delete their own tournaments"
  ON tournaments FOR DELETE
  USING (auth.uid() = creator_id);

-- Policies pour tournament_demands
CREATE POLICY "Demands viewable by creator and demander"
  ON tournament_demands FOR SELECT
  USING (
    auth.uid() = user_id
    OR auth.uid() IN (SELECT creator_id FROM tournaments WHERE id = tournament_id)
  );

CREATE POLICY "Users can create their own demands"
  ON tournament_demands FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tournament creator can update demands"
  ON tournament_demands FOR UPDATE
  USING (
    auth.uid() IN (SELECT creator_id FROM tournaments WHERE id = tournament_id)
  );

CREATE POLICY "Demand deletable by creator or demander"
  ON tournament_demands FOR DELETE
  USING (
    auth.uid() = user_id
    OR auth.uid() IN (SELECT creator_id FROM tournaments WHERE id = tournament_id)
  );

-- Policies pour tournament_messages
CREATE POLICY "Messages viewable by creator and demanders"
  ON tournament_messages FOR SELECT
  USING (
    auth.uid() IN (SELECT creator_id FROM tournaments WHERE id = tournament_id)
    OR auth.uid() IN (SELECT user_id FROM tournament_demands WHERE tournament_id = tournament_messages.tournament_id)
  );

CREATE POLICY "Messages insertable by creator and demanders"
  ON tournament_messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      auth.uid() IN (SELECT creator_id FROM tournaments WHERE id = tournament_id)
      OR auth.uid() IN (SELECT user_id FROM tournament_demands WHERE tournament_id = tournament_messages.tournament_id)
    )
  );

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE tournament_messages;
