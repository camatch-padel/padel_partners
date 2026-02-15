-- ================================================================
-- SCRIPT DE MIGRATION COMPLET - PRODUCTION
-- Padel Partners / CaMatch
-- À exécuter dans la console SQL d'un NOUVEAU projet Supabase
-- Script idempotent : peut être relancé sans erreur
-- ================================================================

-- ============================================
-- 0. TABLE Profiles + Auto-création via trigger
-- ============================================

CREATE TABLE IF NOT EXISTS "Profiles" (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  firstname TEXT,
  lastname TEXT,
  avatar_url TEXT,
  declared_level DECIMAL(3,1),
  community_level DECIMAL(3,1),
  community_level_votes INTEGER DEFAULT 0,
  match_played INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS sur Profiles
ALTER TABLE "Profiles" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all profiles" ON "Profiles";
CREATE POLICY "Users can view all profiles"
  ON "Profiles" FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON "Profiles";
CREATE POLICY "Users can insert their own profile"
  ON "Profiles" FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON "Profiles";
CREATE POLICY "Users can update their own profile"
  ON "Profiles" FOR UPDATE USING (auth.uid() = id);

-- Trigger : auto-créer un profil quand un user s'inscrit
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public."Profiles" (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 1. TABLE courts (Clubs / Terrains)
-- ============================================

CREATE TABLE IF NOT EXISTS courts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. AJOUT court_id SUR Profiles (dépend de courts)
-- ============================================

ALTER TABLE "Profiles"
ADD COLUMN IF NOT EXISTS court_id UUID REFERENCES courts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_avatar_url ON "Profiles"(avatar_url);

-- ============================================
-- 3. TABLE groups (Groupes Privés)
-- ============================================

CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'people',
  creator_id UUID NOT NULL REFERENCES "Profiles"(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groups_creator_id ON groups(creator_id);

-- ============================================
-- 4. TABLE group_members
-- ============================================

CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES "Profiles"(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);

-- ============================================
-- 5. TABLE group_messages
-- ============================================

CREATE TABLE IF NOT EXISTS group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES "Profiles"(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group_id_created_at ON group_messages(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_messages_user_id ON group_messages(user_id);

-- ============================================
-- 6. TABLE matches (Parties)
-- ============================================

CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES "Profiles"(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(date);
CREATE INDEX IF NOT EXISTS idx_matches_creator ON matches(creator_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_visibility ON matches(visibility);

-- ============================================
-- 7. TABLE match_participants
-- ============================================

CREATE TABLE IF NOT EXISTS match_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES "Profiles"(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_participants_match ON match_participants(match_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON match_participants(user_id);

-- ============================================
-- 8. TABLE match_messages
-- ============================================

CREATE TABLE IF NOT EXISTS match_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES "Profiles"(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_messages_match_id_created_at ON match_messages(match_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_messages_user_id ON match_messages(user_id);

-- ============================================
-- 9. TABLE match_requests
-- ============================================

CREATE TABLE IF NOT EXISTS match_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES "Profiles"(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_requests_match_id ON match_requests(match_id);
CREATE INDEX IF NOT EXISTS idx_match_requests_user_id ON match_requests(user_id);

-- ============================================
-- 10. TABLE match_waitlist
-- ============================================

CREATE TABLE IF NOT EXISTS match_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES "Profiles"(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_waitlist_match_id ON match_waitlist(match_id, position);

-- ============================================
-- 11. TABLE match_results
-- ============================================

CREATE TABLE IF NOT EXISTS match_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE UNIQUE,
  team1_player1_id UUID NOT NULL REFERENCES "Profiles"(id),
  team1_player1_position TEXT CHECK (team1_player1_position IN ('left', 'right')),
  team1_player2_id UUID REFERENCES "Profiles"(id),
  team1_player2_position TEXT CHECK (team1_player2_position IN ('left', 'right')),
  team2_player1_id UUID NOT NULL REFERENCES "Profiles"(id),
  team2_player1_position TEXT CHECK (team2_player1_position IN ('left', 'right')),
  team2_player2_id UUID REFERENCES "Profiles"(id),
  team2_player2_position TEXT CHECK (team2_player2_position IN ('left', 'right')),
  sets JSONB NOT NULL DEFAULT '[]',
  winner_team INTEGER CHECK (winner_team IN (1, 2)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_results_match_id ON match_results(match_id);

-- ============================================
-- 12. TABLE match_ratings
-- ============================================

CREATE TABLE IF NOT EXISTS match_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  rater_id UUID NOT NULL REFERENCES "Profiles"(id),
  rated_id UUID NOT NULL REFERENCES "Profiles"(id),
  rating DECIMAL(3,1) NOT NULL CHECK (rating >= 1.0 AND rating <= 10.0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(match_id, rater_id, rated_id)
);

CREATE INDEX IF NOT EXISTS idx_match_ratings_rated_id ON match_ratings(rated_id);

-- ============================================
-- 13. TABLE tournaments
-- ============================================

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
  visibility TEXT NOT NULL DEFAULT 'tous' CHECK (visibility IN ('tous', 'private')),
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'searching' CHECK (status IN ('searching', 'partner_found', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT tournaments_visibility_group_consistency_check CHECK (
    (visibility = 'tous' AND group_id IS NULL)
    OR (visibility = 'private' AND group_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_tournaments_creator ON tournaments(creator_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_date ON tournaments(date);
CREATE INDEX IF NOT EXISTS idx_tournaments_visibility ON tournaments(visibility);
CREATE INDEX IF NOT EXISTS idx_tournaments_group_id ON tournaments(group_id);

-- ============================================
-- 14. TABLE tournament_demands
-- ============================================

CREATE TABLE IF NOT EXISTS tournament_demands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES "Profiles"(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tournament_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_demands_tournament ON tournament_demands(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_demands_user ON tournament_demands(user_id);

-- ============================================
-- 15. TABLE tournament_messages
-- ============================================

CREATE TABLE IF NOT EXISTS tournament_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES "Profiles"(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournament_messages_tournament ON tournament_messages(tournament_id);

-- ============================================
-- 16. FONCTIONS HELPER
-- ============================================

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_groups_updated_at ON groups;
CREATE TRIGGER update_groups_updated_at
  BEFORE UPDATE ON groups FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Vérifier si membre d'un groupe (SECURITY DEFINER pour éviter récursion RLS)
CREATE OR REPLACE FUNCTION is_group_member(group_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM group_members WHERE group_id = group_uuid AND user_id = user_uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Vérifier si créateur d'un groupe
CREATE OR REPLACE FUNCTION is_group_creator(group_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM groups WHERE id = group_uuid AND creator_id = user_uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Vérifier si match public
CREATE OR REPLACE FUNCTION is_match_public(match_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM matches WHERE id = match_uuid AND visibility = 'tous');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Vérifier accès match privé
CREATE OR REPLACE FUNCTION can_access_private_match(match_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM matches m
    JOIN group_members gm ON gm.group_id = m.group_id
    WHERE m.id = match_uuid AND m.visibility = 'private' AND gm.user_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Vérifier si participant d'un match
CREATE OR REPLACE FUNCTION is_match_participant(match_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM match_participants WHERE match_id = match_uuid AND user_id = user_uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Vérifier si créateur d'un match
CREATE OR REPLACE FUNCTION is_match_creator(match_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM matches WHERE id = match_uuid AND creator_id = user_uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 17. TRIGGERS
-- ============================================

-- Mise à jour community_level après notation
CREATE OR REPLACE FUNCTION update_community_level()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "Profiles"
  SET community_level = (
    SELECT ROUND(AVG(rating)::numeric, 1) FROM match_ratings WHERE rated_id = NEW.rated_id
  ),
  community_level_votes = (
    SELECT COUNT(*) FROM match_ratings WHERE rated_id = NEW.rated_id
  )
  WHERE id = NEW.rated_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_community_level ON match_ratings;
CREATE TRIGGER trigger_update_community_level
  AFTER INSERT OR UPDATE ON match_ratings
  FOR EACH ROW EXECUTE FUNCTION update_community_level();

-- Promotion depuis liste d'attente
CREATE OR REPLACE FUNCTION promote_from_waitlist()
RETURNS TRIGGER AS $$
DECLARE
  next_user_id UUID;
  next_entry_id UUID;
  match_format INTEGER;
  current_count INTEGER;
BEGIN
  SELECT format INTO match_format FROM matches WHERE id = OLD.match_id;
  SELECT COUNT(*) INTO current_count FROM match_participants WHERE match_id = OLD.match_id;

  IF current_count < match_format THEN
    SELECT id, user_id INTO next_entry_id, next_user_id
    FROM match_waitlist WHERE match_id = OLD.match_id ORDER BY position ASC LIMIT 1;

    IF next_user_id IS NOT NULL THEN
      INSERT INTO match_participants (match_id, user_id) VALUES (OLD.match_id, next_user_id);
      DELETE FROM match_waitlist WHERE id = next_entry_id;
      UPDATE match_waitlist SET position = position - 1 WHERE match_id = OLD.match_id;

      SELECT COUNT(*) INTO current_count FROM match_participants WHERE match_id = OLD.match_id;
      IF current_count >= match_format THEN
        UPDATE matches SET status = 'full' WHERE id = OLD.match_id;
      END IF;
    END IF;

    IF current_count < match_format THEN
      UPDATE matches SET status = 'open' WHERE id = OLD.match_id;
    END IF;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_promote_waitlist ON match_participants;
CREATE TRIGGER trigger_promote_waitlist
  AFTER DELETE ON match_participants
  FOR EACH ROW EXECUTE FUNCTION promote_from_waitlist();

-- ============================================
-- 18. ACTIVER RLS SUR TOUTES LES TABLES
-- ============================================

ALTER TABLE courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_demands ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 19. POLITIQUES RLS - courts
-- ============================================

DROP POLICY IF EXISTS "Anyone can view courts" ON courts;
CREATE POLICY "Anyone can view courts" ON courts FOR SELECT USING (true);

-- ============================================
-- 20. POLITIQUES RLS - groups
-- ============================================

DROP POLICY IF EXISTS "Users can view groups they are members of" ON groups;
CREATE POLICY "Users can view groups they are members of"
  ON groups FOR SELECT TO authenticated USING (is_group_member(id));

DROP POLICY IF EXISTS "Users can create groups" ON groups;
CREATE POLICY "Users can create groups"
  ON groups FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "Creators can update their groups" ON groups;
CREATE POLICY "Creators can update their groups"
  ON groups FOR UPDATE TO authenticated
  USING (creator_id = auth.uid()) WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "Creators can delete their groups" ON groups;
CREATE POLICY "Creators can delete their groups"
  ON groups FOR DELETE TO authenticated USING (creator_id = auth.uid());

-- ============================================
-- 21. POLITIQUES RLS - group_members
-- ============================================

DROP POLICY IF EXISTS "Members can view members of their groups" ON group_members;
CREATE POLICY "Members can view members of their groups"
  ON group_members FOR SELECT TO authenticated USING (is_group_member(group_id));

DROP POLICY IF EXISTS "Group creators can add members" ON group_members;
CREATE POLICY "Group creators can add members"
  ON group_members FOR INSERT TO authenticated WITH CHECK (is_group_creator(group_id));

DROP POLICY IF EXISTS "Group creators can remove members" ON group_members;
CREATE POLICY "Group creators can remove members"
  ON group_members FOR DELETE TO authenticated
  USING (is_group_creator(group_id) AND user_id != auth.uid());

DROP POLICY IF EXISTS "Members can leave groups (except creators)" ON group_members;
CREATE POLICY "Members can leave groups (except creators)"
  ON group_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND NOT is_group_creator(group_id));

-- ============================================
-- 22. POLITIQUES RLS - group_messages
-- ============================================

DROP POLICY IF EXISTS "Members can view messages in their groups" ON group_messages;
CREATE POLICY "Members can view messages in their groups"
  ON group_messages FOR SELECT TO authenticated USING (is_group_member(group_id));

DROP POLICY IF EXISTS "Members can send messages in their groups" ON group_messages;
CREATE POLICY "Members can send messages in their groups"
  ON group_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_group_member(group_id));

DROP POLICY IF EXISTS "Users can delete their own group messages" ON group_messages;
CREATE POLICY "Users can delete their own group messages"
  ON group_messages FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Group creators can delete any group message" ON group_messages;
CREATE POLICY "Group creators can delete any group message"
  ON group_messages FOR DELETE TO authenticated USING (is_group_creator(group_id));

-- ============================================
-- 23. POLITIQUES RLS - matches
-- ============================================

DROP POLICY IF EXISTS "Anyone can view public matches" ON matches;
CREATE POLICY "Anyone can view public matches"
  ON matches FOR SELECT USING (visibility = 'tous');

DROP POLICY IF EXISTS "Group members can view private matches" ON matches;
CREATE POLICY "Group members can view private matches"
  ON matches FOR SELECT
  USING (visibility = 'private' AND group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can create matches" ON matches;
CREATE POLICY "Users can create matches"
  ON matches FOR INSERT WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Creators can update their matches" ON matches;
CREATE POLICY "Creators can update their matches"
  ON matches FOR UPDATE USING (auth.uid() = creator_id);

-- ============================================
-- 24. POLITIQUES RLS - match_participants
-- ============================================

DROP POLICY IF EXISTS "Anyone can view participants" ON match_participants;
CREATE POLICY "Anyone can view participants"
  ON match_participants FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can join matches or creator can add" ON match_participants;
CREATE POLICY "Users can join matches or creator can add"
  ON match_participants FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR auth.uid() IN (SELECT creator_id FROM matches WHERE id = match_id)
  );

DROP POLICY IF EXISTS "Users can leave or creator can remove" ON match_participants;
CREATE POLICY "Users can leave or creator can remove"
  ON match_participants FOR DELETE
  USING (
    auth.uid() = user_id
    OR auth.uid() IN (SELECT creator_id FROM matches WHERE id = match_id)
  );

-- ============================================
-- 25. POLITIQUES RLS - match_messages
-- ============================================

DROP POLICY IF EXISTS "Users can view messages in accessible matches" ON match_messages;
CREATE POLICY "Users can view messages in accessible matches"
  ON match_messages FOR SELECT TO authenticated
  USING (is_match_public(match_id) OR can_access_private_match(match_id));

DROP POLICY IF EXISTS "Users can send messages in accessible matches" ON match_messages;
CREATE POLICY "Users can send messages in accessible matches"
  ON match_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (is_match_public(match_id) OR can_access_private_match(match_id)));

DROP POLICY IF EXISTS "Users can delete their own match messages" ON match_messages;
CREATE POLICY "Users can delete their own match messages"
  ON match_messages FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Match creators can delete any match message" ON match_messages;
CREATE POLICY "Match creators can delete any match message"
  ON match_messages FOR DELETE TO authenticated
  USING (match_id IN (SELECT id FROM matches WHERE creator_id = auth.uid()));

-- ============================================
-- 26. POLITIQUES RLS - match_requests
-- ============================================

DROP POLICY IF EXISTS "View match requests" ON match_requests;
CREATE POLICY "View match requests"
  ON match_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_match_creator(match_id));

DROP POLICY IF EXISTS "Create match request" ON match_requests;
CREATE POLICY "Create match request"
  ON match_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Update match request" ON match_requests;
CREATE POLICY "Update match request"
  ON match_requests FOR UPDATE TO authenticated USING (is_match_creator(match_id));

DROP POLICY IF EXISTS "Delete match request" ON match_requests;
CREATE POLICY "Delete match request"
  ON match_requests FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR is_match_creator(match_id));

-- ============================================
-- 27. POLITIQUES RLS - match_waitlist
-- ============================================

DROP POLICY IF EXISTS "View match waitlist" ON match_waitlist;
CREATE POLICY "View match waitlist"
  ON match_waitlist FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Join match waitlist" ON match_waitlist;
CREATE POLICY "Join match waitlist"
  ON match_waitlist FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Leave match waitlist" ON match_waitlist;
CREATE POLICY "Leave match waitlist"
  ON match_waitlist FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR is_match_creator(match_id));

-- ============================================
-- 28. POLITIQUES RLS - match_results
-- ============================================

DROP POLICY IF EXISTS "View match results" ON match_results;
CREATE POLICY "View match results"
  ON match_results FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Create match results" ON match_results;
CREATE POLICY "Create match results"
  ON match_results FOR INSERT TO authenticated
  WITH CHECK (is_match_participant(match_id) OR is_match_creator(match_id));

DROP POLICY IF EXISTS "Update match results" ON match_results;
CREATE POLICY "Update match results"
  ON match_results FOR UPDATE TO authenticated
  USING (is_match_participant(match_id) OR is_match_creator(match_id));

-- ============================================
-- 29. POLITIQUES RLS - match_ratings
-- ============================================

DROP POLICY IF EXISTS "View match ratings" ON match_ratings;
CREATE POLICY "View match ratings"
  ON match_ratings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Create match rating" ON match_ratings;
CREATE POLICY "Create match rating"
  ON match_ratings FOR INSERT TO authenticated
  WITH CHECK (rater_id = auth.uid() AND rated_id != auth.uid() AND is_match_participant(match_id));

DROP POLICY IF EXISTS "Update match rating" ON match_ratings;
CREATE POLICY "Update match rating"
  ON match_ratings FOR UPDATE TO authenticated USING (rater_id = auth.uid());

-- ============================================
-- 30. POLITIQUES RLS - tournaments
-- ============================================

DROP POLICY IF EXISTS "Tournaments visible by access scope" ON tournaments;
CREATE POLICY "Tournaments visible by access scope"
  ON tournaments FOR SELECT TO authenticated
  USING (
    visibility = 'tous'
    OR creator_id = auth.uid()
    OR (visibility = 'private' AND EXISTS (
      SELECT 1 FROM group_members gm WHERE gm.group_id = tournaments.group_id AND gm.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Users can create their own tournaments" ON tournaments;
CREATE POLICY "Users can create their own tournaments"
  ON tournaments FOR INSERT TO authenticated
  WITH CHECK (
    creator_id = auth.uid()
    AND (
      (visibility = 'tous' AND group_id IS NULL)
      OR (visibility = 'private' AND group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM group_members gm WHERE gm.group_id = tournaments.group_id AND gm.user_id = auth.uid()
      ))
    )
  );

DROP POLICY IF EXISTS "Users can update their own tournaments" ON tournaments;
CREATE POLICY "Users can update their own tournaments"
  ON tournaments FOR UPDATE TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (
    creator_id = auth.uid()
    AND (
      (visibility = 'tous' AND group_id IS NULL)
      OR (visibility = 'private' AND group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM group_members gm WHERE gm.group_id = tournaments.group_id AND gm.user_id = auth.uid()
      ))
    )
  );

DROP POLICY IF EXISTS "Users can delete their own tournaments" ON tournaments;
CREATE POLICY "Users can delete their own tournaments"
  ON tournaments FOR DELETE TO authenticated USING (creator_id = auth.uid());

-- ============================================
-- 31. POLITIQUES RLS - tournament_demands
-- ============================================

DROP POLICY IF EXISTS "Demands visible by authorized users" ON tournament_demands;
CREATE POLICY "Demands visible by authorized users"
  ON tournament_demands FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM tournaments t WHERE t.id = tournament_demands.tournament_id AND t.creator_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can create their own demands on visible tournaments" ON tournament_demands;
CREATE POLICY "Users can create their own demands on visible tournaments"
  ON tournament_demands FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM tournaments t WHERE t.id = tournament_demands.tournament_id
      AND (t.visibility = 'tous' OR t.creator_id = auth.uid() OR EXISTS (
        SELECT 1 FROM group_members gm WHERE gm.group_id = t.group_id AND gm.user_id = auth.uid()
      ))
    )
  );

DROP POLICY IF EXISTS "Tournament creator can update demands" ON tournament_demands;
CREATE POLICY "Tournament creator can update demands"
  ON tournament_demands FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM tournaments t WHERE t.id = tournament_demands.tournament_id AND t.creator_id = auth.uid()));

DROP POLICY IF EXISTS "Demand deletable by creator or demander" ON tournament_demands;
CREATE POLICY "Demand deletable by creator or demander"
  ON tournament_demands FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM tournaments t WHERE t.id = tournament_demands.tournament_id AND t.creator_id = auth.uid())
  );

-- ============================================
-- 32. POLITIQUES RLS - tournament_messages
-- ============================================

DROP POLICY IF EXISTS "Tournament messages viewable by authorized participants" ON tournament_messages;
CREATE POLICY "Tournament messages viewable by authorized participants"
  ON tournament_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tournaments t WHERE t.id = tournament_messages.tournament_id
    AND (t.creator_id = auth.uid() OR auth.uid() IN (
      SELECT d.user_id FROM tournament_demands d WHERE d.tournament_id = t.id
    ))
  ));

DROP POLICY IF EXISTS "Tournament messages insertable by authorized participants" ON tournament_messages;
CREATE POLICY "Tournament messages insertable by authorized participants"
  ON tournament_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM tournaments t WHERE t.id = tournament_messages.tournament_id
      AND (t.creator_id = auth.uid() OR auth.uid() IN (
        SELECT d.user_id FROM tournament_demands d WHERE d.tournament_id = t.id
      ))
    )
  );

-- ============================================
-- 33. REALTIME
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'tournament_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournament_messages;
  END IF;
END $$;

-- ============================================
-- 34. SEED DATA - Clubs de test
-- ============================================

-- Insérer les clubs uniquement si la table est vide
INSERT INTO courts (name, city, address, latitude, longitude)
SELECT * FROM (VALUES
  ('Padel Club Paris 15', 'Paris', '15 Rue de Vaugirard, 75015 Paris', 48.8422::DECIMAL(10,8), 2.3006::DECIMAL(11,8)),
  ('Green Padel Lyon', 'Lyon', '45 Cours Gambetta, 69007 Lyon', 45.7540, 4.8614),
  ('Padel Riviera Nice', 'Nice', '10 Promenade des Anglais, 06000 Nice', 43.6947, 7.2653),
  ('Urban Padel Toulouse', 'Toulouse', '22 Allée Jean Jaurès, 31000 Toulouse', 43.6047, 1.4442),
  ('Padel Nation Marseille', 'Marseille', '8 Boulevard Charles Livon, 13007 Marseille', 43.2920, 5.3580),
  ('Padel Center Bordeaux', 'Bordeaux', '12 Quai des Chartrons, 33000 Bordeaux', 44.8500, -0.5667),
  ('Padel Arena Lille', 'Lille', '5 Boulevard de la Liberté, 59000 Lille', 50.6292, 3.0573),
  ('Padel Sport Nantes', 'Nantes', '30 Rue de Strasbourg, 44000 Nantes', 47.2184, -1.5536)
) AS v(name, city, address, latitude, longitude)
WHERE NOT EXISTS (SELECT 1 FROM courts LIMIT 1);

-- ================================================================
-- ÉTAPES MANUELLES APRÈS CE SCRIPT :
-- ================================================================
-- 1. Créer le bucket Storage "avatars" :
--    - Supabase Dashboard → Storage → New Bucket
--    - Nom: avatars
--    - Public: true
--    - MIME types: image/jpeg, image/png, image/webp
--    - Max size: 2MB
--
-- 2. Ajouter les policies Storage pour avatars :
--    - SELECT : public (anyone)
--    - INSERT : authenticated users (bucket_id = 'avatars')
--    - UPDATE : owner (auth.uid()::text = (storage.foldername(name))[1])
--    - DELETE : owner (auth.uid()::text = (storage.foldername(name))[1])
-- ================================================================
