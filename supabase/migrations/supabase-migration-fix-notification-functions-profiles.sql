-- Fix runtime errors when legacy trigger functions still reference "Profiles"
-- during match creation. Recreate notification functions with lowercase `profiles`.

CREATE OR REPLACE FUNCTION notify_on_match_participant_insert()
RETURNS TRIGGER AS $$
DECLARE
  match_record RECORD;
  participant_count INTEGER;
  joiner_name TEXT;
  p RECORD;
BEGIN
  SELECT m.id, m.creator_id, m.format, m.date, m.time_slot, c.name AS court_name
  INTO match_record
  FROM matches m
  LEFT JOIN courts c ON c.id = m.court_id
  WHERE m.id = NEW.match_id;

  SELECT COALESCE(firstname || ' ' || lastname, username, 'Un joueur')
  INTO joiner_name
  FROM profiles
  WHERE id = NEW.user_id;

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

  SELECT COUNT(*) INTO participant_count
  FROM match_participants
  WHERE match_id = NEW.match_id;

  IF participant_count >= match_record.format THEN
    FOR p IN
      SELECT user_id FROM match_participants WHERE match_id = NEW.match_id
    LOOP
      INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
      VALUES (
        p.user_id,
        'match_full',
        'Partie complete !',
        'Votre partie du ' || TO_CHAR(match_record.date, 'DD/MM') || ' est au complet',
        'match',
        NEW.match_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION notify_on_group_match_insert()
RETURNS TRIGGER AS $$
DECLARE
  creator_name TEXT;
  group_name TEXT;
  member RECORD;
BEGIN
  IF NEW.visibility != 'private' OR NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(firstname || ' ' || lastname, username, 'Un joueur')
  INTO creator_name
  FROM profiles
  WHERE id = NEW.creator_id;

  SELECT g.name INTO group_name
  FROM groups g
  WHERE g.id = NEW.group_id;

  FOR member IN
    SELECT user_id
    FROM group_members
    WHERE group_id = NEW.group_id AND user_id != NEW.creator_id
  LOOP
    INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
    VALUES (
      member.user_id,
      'group_match_new',
      'Nouvelle partie',
      creator_name || ' a cree une partie le ' || TO_CHAR(NEW.date, 'DD/MM') || ' dans ' || group_name,
      'match',
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
  IF NEW.visibility != 'tous' THEN
    RETURN NEW;
  END IF;

  SELECT c.latitude, c.longitude, c.name
  INTO match_lat, match_lon, match_court_name
  FROM courts c
  WHERE c.id = NEW.court_id;

  IF match_lat IS NULL OR match_lon IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(firstname || ' ' || lastname, username, 'Un joueur')
  INTO creator_name
  FROM profiles
  WHERE id = NEW.creator_id;

  FOR player IN
    SELECT p.id AS user_id, p.declared_level, pc.latitude AS player_lat, pc.longitude AS player_lon
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
      LEAST(
        1,
        GREATEST(
          -1,
          COS(RADIANS(match_lat)) * COS(RADIANS(player.player_lat)) *
          COS(RADIANS(player.player_lon) - RADIANS(match_lon)) +
          SIN(RADIANS(match_lat)) * SIN(RADIANS(player.player_lat))
        )
      )
    );

    IF distance_km <= 30 THEN
      INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
      VALUES (
        player.user_id,
        'nearby_match_new',
        'Partie a proximite',
        creator_name || ' a cree une partie le ' || TO_CHAR(NEW.date, 'DD/MM') || ' a ' || COALESCE(match_court_name, 'un club proche'),
        'match',
        NEW.id
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_match_participant ON match_participants;
CREATE TRIGGER trigger_notify_match_participant
  AFTER INSERT ON match_participants
  FOR EACH ROW EXECUTE FUNCTION notify_on_match_participant_insert();

DROP TRIGGER IF EXISTS trigger_notify_group_match ON matches;
CREATE TRIGGER trigger_notify_group_match
  AFTER INSERT ON matches
  FOR EACH ROW EXECUTE FUNCTION notify_on_group_match_insert();

DROP TRIGGER IF EXISTS trigger_notify_nearby_match ON matches;
CREATE TRIGGER trigger_notify_nearby_match
  AFTER INSERT ON matches
  FOR EACH ROW EXECUTE FUNCTION notify_on_nearby_match_insert();
