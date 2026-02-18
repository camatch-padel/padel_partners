-- =============================================
-- NOTIFICATIONS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "Profiles"(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'match_full',
    'match_player_joined',
    'tournament_demand_new',
    'tournament_demand_accepted',
    'tournament_demand_rejected',
    'group_match_new',
    'nearby_match_new',
    'group_tournament_new'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('match', 'tournament')),
  entity_id UUID NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =============================================
-- REALTIME
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- =============================================
-- TRIGGER 1: match_participants INSERT
-- Notifie le créateur qu'un joueur a rejoint
-- Si la partie est complète, notifie TOUS les joueurs
-- =============================================

CREATE OR REPLACE FUNCTION notify_on_match_participant_insert()
RETURNS TRIGGER AS $$
DECLARE
  match_record RECORD;
  participant_count INTEGER;
  joiner_name TEXT;
  p RECORD;
BEGIN
  -- Récupérer les infos du match
  SELECT m.id, m.creator_id, m.format, m.date, m.time_slot,
         c.name AS court_name
  INTO match_record
  FROM matches m
  LEFT JOIN courts c ON c.id = m.court_id
  WHERE m.id = NEW.match_id;

  -- Récupérer le nom du joueur qui rejoint
  SELECT COALESCE(firstname || ' ' || lastname, username, 'Un joueur')
  INTO joiner_name
  FROM "Profiles" WHERE id = NEW.user_id;

  -- 1) Notifier le CRÉATEUR qu'un joueur a rejoint (sauf si c'est lui-même)
  IF NEW.user_id != match_record.creator_id THEN
    INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
    VALUES (
      match_record.creator_id,
      'match_player_joined',
      'Nouveau joueur',
      joiner_name || ' a rejoint votre partie du ' || TO_CHAR(match_record.date, 'DD/MM'),
      'match',
      NEW.match_id
    );
  END IF;

  -- 2) Vérifier si la partie est maintenant complète
  SELECT COUNT(*) INTO participant_count
  FROM match_participants WHERE match_id = NEW.match_id;

  IF participant_count >= match_record.format THEN
    FOR p IN
      SELECT user_id FROM match_participants WHERE match_id = NEW.match_id
    LOOP
      INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
      VALUES (
        p.user_id,
        'match_full',
        'Partie complète !',
        'Votre partie du ' || TO_CHAR(match_record.date, 'DD/MM') || ' est au complet',
        'match',
        NEW.match_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_match_participant ON match_participants;
CREATE TRIGGER trigger_notify_match_participant
  AFTER INSERT ON match_participants
  FOR EACH ROW EXECUTE FUNCTION notify_on_match_participant_insert();

-- =============================================
-- TRIGGER 2: tournament_demands INSERT
-- Notifie le créateur du tournoi d'une nouvelle demande
-- =============================================

CREATE OR REPLACE FUNCTION notify_on_tournament_demand_insert()
RETURNS TRIGGER AS $$
DECLARE
  tournament_creator_id UUID;
  tournament_date DATE;
  demander_name TEXT;
BEGIN
  SELECT t.creator_id, t.date INTO tournament_creator_id, tournament_date
  FROM tournaments t WHERE t.id = NEW.tournament_id;

  SELECT COALESCE(firstname || ' ' || lastname, username, 'Un joueur')
  INTO demander_name
  FROM "Profiles" WHERE id = NEW.user_id;

  INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
  VALUES (
    tournament_creator_id,
    'tournament_demand_new',
    'Nouvelle demande',
    demander_name || ' souhaite être votre partenaire pour le tournoi du ' || TO_CHAR(tournament_date, 'DD/MM'),
    'tournament',
    NEW.tournament_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_tournament_demand ON tournament_demands;
CREATE TRIGGER trigger_notify_tournament_demand
  AFTER INSERT ON tournament_demands
  FOR EACH ROW EXECUTE FUNCTION notify_on_tournament_demand_insert();

-- =============================================
-- TRIGGER 3: tournament_demands UPDATE (status)
-- Notifie le demandeur de l'acceptation ou du refus
-- =============================================

CREATE OR REPLACE FUNCTION notify_on_tournament_demand_update()
RETURNS TRIGGER AS $$
DECLARE
  tournament_date DATE;
  notif_type TEXT;
  notif_title TEXT;
  notif_message TEXT;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('accepted', 'rejected') THEN
    RETURN NEW;
  END IF;

  SELECT t.date INTO tournament_date
  FROM tournaments t WHERE t.id = NEW.tournament_id;

  IF NEW.status = 'accepted' THEN
    notif_type := 'tournament_demand_accepted';
    notif_title := 'Demande acceptée !';
    notif_message := 'Votre demande pour le tournoi du ' || TO_CHAR(tournament_date, 'DD/MM') || ' a été acceptée';
  ELSE
    notif_type := 'tournament_demand_rejected';
    notif_title := 'Demande refusée';
    notif_message := 'Votre demande pour le tournoi du ' || TO_CHAR(tournament_date, 'DD/MM') || ' a été refusée';
  END IF;

  INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
  VALUES (
    NEW.user_id,
    notif_type,
    notif_title,
    notif_message,
    'tournament',
    NEW.tournament_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_tournament_demand_update ON tournament_demands;
CREATE TRIGGER trigger_notify_tournament_demand_update
  AFTER UPDATE ON tournament_demands
  FOR EACH ROW EXECUTE FUNCTION notify_on_tournament_demand_update();

-- =============================================
-- TRIGGER 4: matches INSERT (groupe privé)
-- Notifie les membres du groupe qu'une nouvelle
-- partie a été créée (sauf le créateur)
-- =============================================

CREATE OR REPLACE FUNCTION notify_on_group_match_insert()
RETURNS TRIGGER AS $$
DECLARE
  creator_name TEXT;
  group_name TEXT;
  member RECORD;
BEGIN
  -- Seulement les parties privées dans un groupe
  IF NEW.visibility != 'private' OR NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(firstname || ' ' || lastname, username, 'Un joueur')
  INTO creator_name
  FROM "Profiles" WHERE id = NEW.creator_id;

  SELECT g.name INTO group_name
  FROM groups g WHERE g.id = NEW.group_id;

  FOR member IN
    SELECT user_id FROM group_members
    WHERE group_id = NEW.group_id AND user_id != NEW.creator_id
  LOOP
    INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
    VALUES (
      member.user_id,
      'group_match_new',
      'Nouvelle partie',
      creator_name || ' a créé une partie le ' || TO_CHAR(NEW.date, 'DD/MM') || ' dans ' || group_name,
      'match',
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_group_match ON matches;
CREATE TRIGGER trigger_notify_group_match
  AFTER INSERT ON matches
  FOR EACH ROW EXECUTE FUNCTION notify_on_group_match_insert();

-- =============================================
-- TRIGGER 5: matches INSERT (public, proximité + niveau)
-- Notifie les joueurs dont le club est à moins de
-- 30km du lieu de la partie ET dont le niveau déclaré
-- est compatible (level_min entre niveau-1 et niveau+2)
-- =============================================

CREATE OR REPLACE FUNCTION notify_on_nearby_match_insert()
RETURNS TRIGGER AS $$
DECLARE
  match_lat DECIMAL(10,8);
  match_lon DECIMAL(11,8);
  match_court_name TEXT;
  creator_name TEXT;
  player RECORD;
  distance_km DECIMAL;
BEGIN
  -- Seulement les parties publiques
  IF NEW.visibility != 'tous' THEN
    RETURN NEW;
  END IF;

  -- Récupérer les coordonnées du terrain de la partie
  SELECT c.latitude, c.longitude, c.name
  INTO match_lat, match_lon, match_court_name
  FROM courts c WHERE c.id = NEW.court_id;

  -- Si pas de coordonnées, on ne peut pas calculer la distance
  IF match_lat IS NULL OR match_lon IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(firstname || ' ' || lastname, username, 'Un joueur')
  INTO creator_name
  FROM "Profiles" WHERE id = NEW.creator_id;

  -- Pour chaque joueur ayant un club avec coordonnées et un niveau déclaré
  FOR player IN
    SELECT p.id AS user_id, p.declared_level,
           pc.latitude AS player_lat, pc.longitude AS player_lon
    FROM "Profiles" p
    JOIN courts pc ON pc.id = p.court_id
    WHERE p.id != NEW.creator_id
      AND p.declared_level IS NOT NULL
      AND pc.latitude IS NOT NULL
      AND pc.longitude IS NOT NULL
      -- Filtre niveau : level_min de la partie entre (niveau joueur - 1) et (niveau joueur + 2)
      AND NEW.level_min >= (p.declared_level - 1)
      AND NEW.level_min <= (p.declared_level + 2)
  LOOP
    -- Calcul distance Haversine en km
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
        player.user_id,
        'nearby_match_new',
        'Partie à proximité',
        creator_name || ' a créé une partie le ' || TO_CHAR(NEW.date, 'DD/MM') || ' à ' || COALESCE(match_court_name, 'un club proche'),
        'match',
        NEW.id
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_nearby_match ON matches;
CREATE TRIGGER trigger_notify_nearby_match
  AFTER INSERT ON matches
  FOR EACH ROW EXECUTE FUNCTION notify_on_nearby_match_insert();

-- =============================================
-- TRIGGER 6: tournaments INSERT (groupe privé)
-- Notifie les membres du groupe qu'une nouvelle
-- recherche de partenaire a été publiée (sauf le créateur)
-- =============================================

CREATE OR REPLACE FUNCTION notify_on_group_tournament_insert()
RETURNS TRIGGER AS $$
DECLARE
  creator_name TEXT;
  group_name TEXT;
  member RECORD;
BEGIN
  -- Seulement les tournois privés dans un groupe
  IF NEW.visibility != 'private' OR NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(firstname || ' ' || lastname, username, 'Un joueur')
  INTO creator_name
  FROM "Profiles" WHERE id = NEW.creator_id;

  SELECT g.name INTO group_name
  FROM groups g WHERE g.id = NEW.group_id;

  FOR member IN
    SELECT user_id FROM group_members
    WHERE group_id = NEW.group_id AND user_id != NEW.creator_id
  LOOP
    INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
    VALUES (
      member.user_id,
      'group_tournament_new',
      'Recherche partenaire',
      creator_name || ' cherche un partenaire pour un tournoi le ' || TO_CHAR(NEW.date, 'DD/MM') || ' dans ' || group_name,
      'tournament',
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_group_tournament ON tournaments;
CREATE TRIGGER trigger_notify_group_tournament
  AFTER INSERT ON tournaments
  FOR EACH ROW EXECUTE FUNCTION notify_on_group_tournament_insert();
