-- =============================================
-- MIGRATION V2 : Ajout de 3 nouveaux types de notifications
-- et 3 nouveaux triggers
-- À exécuter si la table notifications existe déjà
-- =============================================

-- 1) Modifier la contrainte CHECK pour ajouter les nouveaux types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'match_full',
  'match_player_joined',
  'tournament_demand_new',
  'tournament_demand_accepted',
  'tournament_demand_rejected',
  'group_match_new',
  'nearby_match_new',
  'group_tournament_new'
));

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
  FROM profiles WHERE id = NEW.creator_id;

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
  FROM profiles WHERE id = NEW.creator_id;

  -- Pour chaque joueur ayant un club avec coordonnées et un niveau déclaré
  FOR player IN
    SELECT p.id AS user_id, p.declared_level,
           pc.latitude AS player_lat, pc.longitude AS player_lon
    FROM profiles p
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
  FROM profiles WHERE id = NEW.creator_id;

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

