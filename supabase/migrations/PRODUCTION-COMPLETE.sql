-- ================================================================
-- CAMATCH - SCRIPT DE MIGRATION COMPLET PRODUCTION
-- Version finale consolidée - toutes les migrations incluses
-- Script idempotent : peut être exécuté sur un projet neuf
-- ================================================================


-- ============================================
-- 0. HANDLE_NEW_USER - Trigger auto-création profil
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================
-- 1. TABLE profiles
-- ============================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  firstname TEXT,
  lastname TEXT,
  avatar_url TEXT,
  declared_level DECIMAL(3,1),
  community_level DECIMAL(3,1),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_avatar_url ON profiles(avatar_url);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can delete their own profile" ON profiles;
CREATE POLICY "Users can delete their own profile"
  ON profiles FOR DELETE USING (auth.uid() = id);


-- ============================================
-- 2. TABLE courts
-- ============================================

CREATE TABLE IF NOT EXISTS courts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE courts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view courts" ON courts;
CREATE POLICY "Anyone can view courts" ON courts FOR SELECT USING (true);


-- ============================================
-- 3. AJOUT court_id + expo_push_token SUR profiles
-- ============================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS court_id UUID REFERENCES courts(id) ON DELETE SET NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_expo_push_token
  ON profiles (expo_push_token) WHERE expo_push_token IS NOT NULL;


-- ============================================
-- 4. TABLE groups
-- ============================================

CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'people',
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groups_creator_id ON groups(creator_id);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;


-- ============================================
-- 5. TABLE group_members
-- ============================================

CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;


-- ============================================
-- 6. TABLE group_messages
-- ============================================

CREATE TABLE IF NOT EXISTS group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group_id_created_at
  ON group_messages(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_messages_user_id ON group_messages(user_id);

ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;


-- ============================================
-- 7. TABLE matches
-- ============================================

CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time_slot TIME NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes IN (60, 90, 120)),
  format INTEGER NOT NULL CHECK (format IN (2, 4)),
  level_min DECIMAL(3,1) NOT NULL CHECK (level_min >= 1.0 AND level_min <= 10.0),
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

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;


-- ============================================
-- 8. TABLE match_participants
-- ============================================

CREATE TABLE IF NOT EXISTS match_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_participants_match ON match_participants(match_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON match_participants(user_id);

ALTER TABLE match_participants ENABLE ROW LEVEL SECURITY;


-- ============================================
-- 9. TABLE match_messages
-- ============================================

CREATE TABLE IF NOT EXISTS match_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_messages_match_id_created_at
  ON match_messages(match_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_messages_user_id ON match_messages(user_id);

ALTER TABLE match_messages ENABLE ROW LEVEL SECURITY;


-- ============================================
-- 10. TABLE match_requests
-- ============================================

CREATE TABLE IF NOT EXISTS match_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_requests_match_id ON match_requests(match_id);
CREATE INDEX IF NOT EXISTS idx_match_requests_user_id ON match_requests(user_id);

ALTER TABLE match_requests ENABLE ROW LEVEL SECURITY;


-- ============================================
-- 11. TABLE match_waitlist
-- ============================================

CREATE TABLE IF NOT EXISTS match_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_waitlist_match_id ON match_waitlist(match_id, position);

ALTER TABLE match_waitlist ENABLE ROW LEVEL SECURITY;


-- ============================================
-- 12. TABLE match_results
-- ============================================

CREATE TABLE IF NOT EXISTS match_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE UNIQUE,
  team1_player1_id UUID NOT NULL REFERENCES profiles(id),
  team1_player1_position TEXT CHECK (team1_player1_position IN ('left', 'right')),
  team1_player2_id UUID REFERENCES profiles(id),
  team1_player2_position TEXT CHECK (team1_player2_position IN ('left', 'right')),
  team2_player1_id UUID NOT NULL REFERENCES profiles(id),
  team2_player1_position TEXT CHECK (team2_player1_position IN ('left', 'right')),
  team2_player2_id UUID REFERENCES profiles(id),
  team2_player2_position TEXT CHECK (team2_player2_position IN ('left', 'right')),
  sets JSONB NOT NULL DEFAULT '[]',
  winner_team INTEGER CHECK (winner_team IN (1, 2)),
  level_delta_applied BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_results_match_id ON match_results(match_id);

ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;


-- ============================================
-- 13. TABLE tournaments
-- ============================================

CREATE TABLE IF NOT EXISTS tournaments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
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
  CONSTRAINT tournaments_visibility_group_check CHECK (
    (visibility = 'tous' AND group_id IS NULL)
    OR (visibility = 'private' AND group_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_tournaments_creator ON tournaments(creator_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_date ON tournaments(date);
CREATE INDEX IF NOT EXISTS idx_tournaments_visibility ON tournaments(visibility);
CREATE INDEX IF NOT EXISTS idx_tournaments_group_id ON tournaments(group_id);

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;


-- ============================================
-- 14. TABLE tournament_demands
-- ============================================

CREATE TABLE IF NOT EXISTS tournament_demands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tournament_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_demands_tournament ON tournament_demands(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_demands_user ON tournament_demands(user_id);

ALTER TABLE tournament_demands ENABLE ROW LEVEL SECURITY;


-- ============================================
-- 15. TABLE tournament_messages
-- ============================================

CREATE TABLE IF NOT EXISTS tournament_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournament_messages_tournament ON tournament_messages(tournament_id);

ALTER TABLE tournament_messages ENABLE ROW LEVEL SECURITY;


-- ============================================
-- 16. TABLE notifications
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'match_full',
    'match_player_joined',
    'tournament_demand_new',
    'tournament_demand_accepted',
    'tournament_demand_rejected',
    'group_match_new',
    'nearby_match_new',
    'group_tournament_new',
    'group_message_new'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('match', 'tournament', 'group')),
  entity_id UUID NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own notifications" ON notifications;
CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE TO authenticated USING (user_id = auth.uid());


-- ============================================
-- 17. FONCTIONS HELPER (SECURITY DEFINER)
-- ============================================

CREATE OR REPLACE FUNCTION is_group_member(group_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM group_members WHERE group_id = group_uuid AND user_id = user_uuid
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_group_creator(group_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM groups WHERE id = group_uuid AND creator_id = user_uuid
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_match_public(match_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM matches WHERE id = match_uuid AND visibility = 'tous');
END;
$$;

CREATE OR REPLACE FUNCTION can_access_private_match(match_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM matches m
    JOIN group_members gm ON gm.group_id = m.group_id
    WHERE m.id = match_uuid AND m.visibility = 'private' AND gm.user_id = user_uuid
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_match_participant(match_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM match_participants WHERE match_id = match_uuid AND user_id = user_uuid
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_match_creator(match_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM matches WHERE id = match_uuid AND creator_id = user_uuid);
END;
$$;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_groups_updated_at ON groups;
CREATE TRIGGER update_groups_updated_at
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================
-- 18. FONCTION delete_own_account
-- ============================================

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifie';
  END IF;
  DELETE FROM public.profiles WHERE id = current_user_id;
  DELETE FROM auth.users WHERE id = current_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;


-- ============================================
-- 19. FONCTION apply_match_level_deltas
-- ============================================

CREATE OR REPLACE FUNCTION apply_match_level_deltas(p_match_result_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r             match_results%ROWTYPE;
  t1_weight     NUMERIC := 0;
  t2_weight     NUMERIC := 0;
  diff1         NUMERIC;
  diff2         NUMERIC;
  t1_delta      NUMERIC := 0;
  t2_delta      NUMERIC := 0;
  threshold     NUMERIC := 1.0;
BEGIN
  SELECT * INTO r FROM match_results WHERE id = p_match_result_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF r.level_delta_applied IS TRUE OR r.winner_team IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(declared_level), 0) INTO t1_weight
  FROM profiles
  WHERE id IN (r.team1_player1_id, r.team1_player2_id) AND id IS NOT NULL;

  SELECT COALESCE(SUM(declared_level), 0) INTO t2_weight
  FROM profiles
  WHERE id IN (r.team2_player1_id, r.team2_player2_id) AND id IS NOT NULL;

  diff1 := t2_weight - t1_weight;
  diff2 := t1_weight - t2_weight;

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

  UPDATE profiles
  SET community_level = ROUND(
    LEAST(10, GREATEST(1, COALESCE(community_level, declared_level, 1) + t1_delta))::numeric, 1
  )
  WHERE id IN (r.team1_player1_id, r.team1_player2_id) AND id IS NOT NULL;

  UPDATE profiles
  SET community_level = ROUND(
    LEAST(10, GREATEST(1, COALESCE(community_level, declared_level, 1) + t2_delta))::numeric, 1
  )
  WHERE id IN (r.team2_player1_id, r.team2_player2_id) AND id IS NOT NULL;

  UPDATE match_results SET level_delta_applied = TRUE WHERE id = p_match_result_id;
END;
$$;


-- ============================================
-- 20. TRIGGER promote_from_waitlist
-- ============================================

CREATE OR REPLACE FUNCTION promote_from_waitlist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_user_id  UUID;
  next_entry_id UUID;
  match_format  INTEGER;
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
$$;

DROP TRIGGER IF EXISTS trigger_promote_waitlist ON match_participants;
CREATE TRIGGER trigger_promote_waitlist
  AFTER DELETE ON match_participants
  FOR EACH ROW EXECUTE FUNCTION promote_from_waitlist();


-- ============================================
-- 21. TRIGGERS NOTIFICATIONS
-- ============================================

CREATE OR REPLACE FUNCTION notify_on_match_participant_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  match_record    RECORD;
  participant_count INTEGER;
  joiner_name     TEXT;
  p               RECORD;
BEGIN
  SELECT m.id, m.creator_id, m.format, m.date, c.name AS court_name
  INTO match_record
  FROM matches m
  LEFT JOIN courts c ON c.id = m.court_id
  WHERE m.id = NEW.match_id;

  SELECT COALESCE(firstname || ' ' || lastname, username, 'Un joueur')
  INTO joiner_name
  FROM profiles WHERE id = NEW.user_id;

  IF NEW.user_id != match_record.creator_id THEN
    INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
    VALUES (
      match_record.creator_id, 'match_player_joined', 'Nouveau joueur',
      joiner_name || ' a rejoint votre partie du ' || TO_CHAR(match_record.date, 'DD/MM'),
      'match', NEW.match_id
    );
  END IF;

  SELECT COUNT(*) INTO participant_count
  FROM match_participants WHERE match_id = NEW.match_id;

  IF participant_count >= match_record.format THEN
    FOR p IN SELECT user_id FROM match_participants WHERE match_id = NEW.match_id LOOP
      INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
      VALUES (
        p.user_id, 'match_full', 'Partie complete !',
        'Votre partie du ' || TO_CHAR(match_record.date, 'DD/MM') || ' est au complet',
        'match', NEW.match_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_match_participant ON match_participants;
CREATE TRIGGER trigger_notify_match_participant
  AFTER INSERT ON match_participants
  FOR EACH ROW EXECUTE FUNCTION notify_on_match_participant_insert();

-- ---

CREATE OR REPLACE FUNCTION notify_on_tournament_demand_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tournament_creator_id UUID;
  tournament_date DATE;
  demander_name TEXT;
BEGIN
  SELECT t.creator_id, t.date INTO tournament_creator_id, tournament_date
  FROM tournaments t WHERE t.id = NEW.tournament_id;

  SELECT COALESCE(firstname || ' ' || lastname, username, 'Un joueur')
  INTO demander_name
  FROM profiles WHERE id = NEW.user_id;

  INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
  VALUES (
    tournament_creator_id, 'tournament_demand_new', 'Nouvelle demande',
    demander_name || ' souhaite etre votre partenaire pour le tournoi du ' || TO_CHAR(tournament_date, 'DD/MM'),
    'tournament', NEW.tournament_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_tournament_demand ON tournament_demands;
CREATE TRIGGER trigger_notify_tournament_demand
  AFTER INSERT ON tournament_demands
  FOR EACH ROW EXECUTE FUNCTION notify_on_tournament_demand_insert();

-- ---

CREATE OR REPLACE FUNCTION notify_on_tournament_demand_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tournament_date DATE;
  notif_type TEXT;
  notif_title TEXT;
  notif_message TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('accepted', 'rejected') THEN RETURN NEW; END IF;

  SELECT t.date INTO tournament_date FROM tournaments t WHERE t.id = NEW.tournament_id;

  IF NEW.status = 'accepted' THEN
    notif_type    := 'tournament_demand_accepted';
    notif_title   := 'Demande acceptee !';
    notif_message := 'Votre demande pour le tournoi du ' || TO_CHAR(tournament_date, 'DD/MM') || ' a ete acceptee';
  ELSE
    notif_type    := 'tournament_demand_rejected';
    notif_title   := 'Demande refusee';
    notif_message := 'Votre demande pour le tournoi du ' || TO_CHAR(tournament_date, 'DD/MM') || ' a ete refusee';
  END IF;

  INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
  VALUES (NEW.user_id, notif_type, notif_title, notif_message, 'tournament', NEW.tournament_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_tournament_demand_update ON tournament_demands;
CREATE TRIGGER trigger_notify_tournament_demand_update
  AFTER UPDATE ON tournament_demands
  FOR EACH ROW EXECUTE FUNCTION notify_on_tournament_demand_update();

-- ---

CREATE OR REPLACE FUNCTION notify_on_group_match_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator_name TEXT;
  group_name TEXT;
  member RECORD;
BEGIN
  IF NEW.visibility != 'private' OR NEW.group_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(firstname || ' ' || lastname, username, 'Un joueur')
  INTO creator_name FROM profiles WHERE id = NEW.creator_id;

  SELECT g.name INTO group_name FROM groups g WHERE g.id = NEW.group_id;

  FOR member IN
    SELECT user_id FROM group_members
    WHERE group_id = NEW.group_id AND user_id != NEW.creator_id
  LOOP
    INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
    VALUES (
      member.user_id, 'group_match_new', 'Nouvelle partie',
      creator_name || ' a cree une partie le ' || TO_CHAR(NEW.date, 'DD/MM') || ' dans ' || group_name,
      'match', NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_group_match ON matches;
CREATE TRIGGER trigger_notify_group_match
  AFTER INSERT ON matches
  FOR EACH ROW EXECUTE FUNCTION notify_on_group_match_insert();

-- ---

CREATE OR REPLACE FUNCTION notify_on_nearby_match_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  match_lat       DECIMAL(10,8);
  match_lon       DECIMAL(11,8);
  match_court_name TEXT;
  creator_name    TEXT;
  player          RECORD;
  distance_km     DECIMAL;
BEGIN
  IF NEW.visibility != 'tous' THEN RETURN NEW; END IF;

  SELECT c.latitude, c.longitude, c.name
  INTO match_lat, match_lon, match_court_name
  FROM courts c WHERE c.id = NEW.court_id;

  IF match_lat IS NULL OR match_lon IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(firstname || ' ' || lastname, username, 'Un joueur')
  INTO creator_name FROM profiles WHERE id = NEW.creator_id;

  FOR player IN
    SELECT p.id AS user_id, p.declared_level,
           pc.latitude AS player_lat, pc.longitude AS player_lon
    FROM profiles p
    JOIN courts pc ON pc.id = p.court_id
    WHERE p.id != NEW.creator_id
      AND p.declared_level IS NOT NULL
      AND pc.latitude IS NOT NULL
      AND pc.longitude IS NOT NULL
      AND NEW.level_min >= (p.declared_level - 1)
      AND NEW.level_min <= (p.declared_level + 2)
  LOOP
    distance_km := 6371 * ACOS(
      LEAST(1, GREATEST(-1,
        COS(RADIANS(match_lat)) * COS(RADIANS(player.player_lat)) *
        COS(RADIANS(player.player_lon) - RADIANS(match_lon)) +
        SIN(RADIANS(match_lat)) * SIN(RADIANS(player.player_lat))
      ))
    );
    IF distance_km <= 30 THEN
      INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
      VALUES (
        player.user_id, 'nearby_match_new', 'Partie a proximite',
        creator_name || ' a cree une partie le ' || TO_CHAR(NEW.date, 'DD/MM') || ' a ' || COALESCE(match_court_name, 'un club proche'),
        'match', NEW.id
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_nearby_match ON matches;
CREATE TRIGGER trigger_notify_nearby_match
  AFTER INSERT ON matches
  FOR EACH ROW EXECUTE FUNCTION notify_on_nearby_match_insert();

-- ---

CREATE OR REPLACE FUNCTION notify_on_group_tournament_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator_name TEXT;
  group_name TEXT;
  member RECORD;
BEGIN
  IF NEW.visibility != 'private' OR NEW.group_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(firstname || ' ' || lastname, username, 'Un joueur')
  INTO creator_name FROM profiles WHERE id = NEW.creator_id;

  SELECT g.name INTO group_name FROM groups g WHERE g.id = NEW.group_id;

  FOR member IN
    SELECT user_id FROM group_members
    WHERE group_id = NEW.group_id AND user_id != NEW.creator_id
  LOOP
    INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
    VALUES (
      member.user_id, 'group_tournament_new', 'Recherche partenaire',
      creator_name || ' cherche un partenaire pour un tournoi le ' || TO_CHAR(NEW.date, 'DD/MM') || ' dans ' || group_name,
      'tournament', NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_group_tournament ON tournaments;
CREATE TRIGGER trigger_notify_group_tournament
  AFTER INSERT ON tournaments
  FOR EACH ROW EXECUTE FUNCTION notify_on_group_tournament_insert();

-- ---

CREATE OR REPLACE FUNCTION notify_on_group_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  group_name  TEXT;
  sender_name TEXT;
  member_id   UUID;
BEGIN
  SELECT name INTO group_name FROM groups WHERE id = NEW.group_id;

  SELECT COALESCE(firstname || ' ' || lastname, username, 'Quelqu''un')
  INTO sender_name
  FROM profiles WHERE id = NEW.user_id;

  FOR member_id IN
    SELECT user_id FROM group_members
    WHERE group_id = NEW.group_id AND user_id <> NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
    VALUES (
      member_id, 'group_message_new',
      COALESCE(group_name, 'Groupe'),
      sender_name || ' : ' || LEFT(NEW.message, 100),
      'group', NEW.group_id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_group_message ON group_messages;
CREATE TRIGGER trigger_notify_group_message
  AFTER INSERT ON group_messages
  FOR EACH ROW EXECUTE FUNCTION notify_on_group_message_insert();


-- ============================================
-- 22. RLS - groups
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
-- 23. RLS - group_members
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
-- 24. RLS - group_messages
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
-- 25. RLS - matches
-- ============================================

DROP POLICY IF EXISTS "Anyone can view public matches" ON matches;
CREATE POLICY "Anyone can view public matches"
  ON matches FOR SELECT USING (visibility = 'tous');

DROP POLICY IF EXISTS "Group members can view private matches" ON matches;
CREATE POLICY "Group members can view private matches"
  ON matches FOR SELECT
  USING (visibility = 'private' AND group_id IN (
    SELECT group_id FROM group_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can create matches" ON matches;
CREATE POLICY "Users can create matches"
  ON matches FOR INSERT WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Creators can update their matches" ON matches;
CREATE POLICY "Creators can update their matches"
  ON matches FOR UPDATE USING (auth.uid() = creator_id);


-- ============================================
-- 26. RLS - match_participants
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
-- 27. RLS - match_messages
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
-- 28. RLS - match_requests
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
-- 29. RLS - match_waitlist
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
-- 30. RLS - match_results
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
-- 31. RLS - tournaments
-- ============================================

DROP POLICY IF EXISTS "Tournaments visible by access scope" ON tournaments;
CREATE POLICY "Tournaments visible by access scope"
  ON tournaments FOR SELECT TO authenticated
  USING (
    visibility = 'tous'
    OR creator_id = auth.uid()
    OR (visibility = 'private' AND EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = tournaments.group_id AND gm.user_id = auth.uid()
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
        SELECT 1 FROM group_members gm
        WHERE gm.group_id = tournaments.group_id AND gm.user_id = auth.uid()
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
        SELECT 1 FROM group_members gm
        WHERE gm.group_id = tournaments.group_id AND gm.user_id = auth.uid()
      ))
    )
  );

DROP POLICY IF EXISTS "Users can delete their own tournaments" ON tournaments;
CREATE POLICY "Users can delete their own tournaments"
  ON tournaments FOR DELETE TO authenticated USING (creator_id = auth.uid());


-- ============================================
-- 32. RLS - tournament_demands
-- ============================================

DROP POLICY IF EXISTS "Demands visible by authorized users" ON tournament_demands;
CREATE POLICY "Demands visible by authorized users"
  ON tournament_demands FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM tournaments t WHERE t.id = tournament_id AND t.creator_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can create their own demands" ON tournament_demands;
CREATE POLICY "Users can create their own demands"
  ON tournament_demands FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM tournaments t WHERE t.id = tournament_id
      AND (t.visibility = 'tous' OR t.creator_id = auth.uid() OR EXISTS (
        SELECT 1 FROM group_members gm WHERE gm.group_id = t.group_id AND gm.user_id = auth.uid()
      ))
    )
  );

DROP POLICY IF EXISTS "Tournament creator can update demands" ON tournament_demands;
CREATE POLICY "Tournament creator can update demands"
  ON tournament_demands FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM tournaments t WHERE t.id = tournament_id AND t.creator_id = auth.uid()));

DROP POLICY IF EXISTS "Demand deletable by creator or demander" ON tournament_demands;
CREATE POLICY "Demand deletable by creator or demander"
  ON tournament_demands FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM tournaments t WHERE t.id = tournament_id AND t.creator_id = auth.uid())
  );


-- ============================================
-- 33. RLS - tournament_messages
-- ============================================

DROP POLICY IF EXISTS "Tournament messages viewable by authorized participants" ON tournament_messages;
CREATE POLICY "Tournament messages viewable by authorized participants"
  ON tournament_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tournaments t WHERE t.id = tournament_id
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
      SELECT 1 FROM tournaments t WHERE t.id = tournament_id
      AND (t.creator_id = auth.uid() OR auth.uid() IN (
        SELECT d.user_id FROM tournament_demands d WHERE d.tournament_id = t.id
      ))
    )
  );


-- ============================================
-- 34. REALTIME
-- ============================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'match_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE match_messages;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'group_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE group_messages;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tournament_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournament_messages;
  END IF;
END $$;


-- ============================================
-- 35. SEED DATA - Clubs padel France
-- ============================================

INSERT INTO courts (name, city, address, latitude, longitude)
SELECT * FROM (VALUES
  ('Padel Club Paris 15', 'Paris', '15 Rue de Vaugirard, 75015 Paris', 48.8422::DECIMAL(10,8), 2.3006::DECIMAL(11,8)),
  ('Green Padel Lyon', 'Lyon', '45 Cours Gambetta, 69007 Lyon', 45.7540, 4.8614),
  ('Padel Riviera Nice', 'Nice', '10 Promenade des Anglais, 06000 Nice', 43.6947, 7.2653),
  ('Urban Padel Toulouse', 'Toulouse', '22 Allee Jean Jaures, 31000 Toulouse', 43.6047, 1.4442),
  ('Padel Nation Marseille', 'Marseille', '8 Boulevard Charles Livon, 13007 Marseille', 43.2920, 5.3580),
  ('Padel Center Bordeaux', 'Bordeaux', '12 Quai des Chartrons, 33000 Bordeaux', 44.8500, -0.5667),
  ('Padel Arena Lille', 'Lille', '5 Boulevard de la Liberte, 59000 Lille', 50.6292, 3.0573),
  ('Padel Sport Nantes', 'Nantes', '30 Rue de Strasbourg, 44000 Nantes', 47.2184, -1.5536)
) AS v(name, city, address, latitude, longitude)
WHERE NOT EXISTS (SELECT 1 FROM courts LIMIT 1);


-- ================================================================
-- ETAPES MANUELLES APRES CE SCRIPT :
-- ================================================================
-- 1. Storage bucket "avatars" :
--    Dashboard → Storage → New Bucket → avatars (Public: true)
--    Policies :
--      SELECT : public (USING true)
--      INSERT : authenticated (WITH CHECK bucket_id = 'avatars')
--      UPDATE : owner (USING auth.uid()::text = (storage.foldername(name))[1])
--      DELETE : owner (USING auth.uid()::text = (storage.foldername(name))[1])
--
-- 2. Edge Function "delete-account" :
--    Deployer supabase/functions/delete-account/index.ts
--
-- 3. Database Webhook sur notifications (pour push notifications) :
--    Table: notifications / Event: INSERT
--    URL: https://<project-ref>.supabase.co/functions/v1/push-notification
-- ================================================================
