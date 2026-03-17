-- Migration : Notification pour les nouveaux messages dans les groupes privés

-- 1. Ajouter 'group_message_new' à la contrainte CHECK sur notifications.type
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'match_full',
  'match_player_joined',
  'tournament_demand_new',
  'tournament_demand_accepted',
  'tournament_demand_rejected',
  'group_match_new',
  'nearby_match_new',
  'group_tournament_new',
  'group_message_new'
));

-- 2. Ajouter 'group' à la contrainte CHECK sur notifications.entity_type
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_entity_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_entity_type_check
  CHECK (entity_type IN ('match', 'tournament', 'group'));

-- 3. Fonction trigger : notifie les membres du groupe quand un message est envoyé
--    (sauf l'expéditeur lui-même)
CREATE OR REPLACE FUNCTION notify_on_group_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  group_name TEXT;
  sender_name TEXT;
  member_id UUID;
BEGIN
  -- Nom du groupe
  SELECT name INTO group_name FROM groups WHERE id = NEW.group_id;

  -- Nom de l'expéditeur
  SELECT COALESCE(firstname || ' ' || lastname, username, 'Quelqu''un')
  INTO sender_name
  FROM profiles WHERE id = NEW.user_id;

  -- Notifier tous les membres du groupe sauf l'expéditeur
  FOR member_id IN
    SELECT user_id FROM group_members
    WHERE group_id = NEW.group_id AND user_id <> NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
    VALUES (
      member_id,
      'group_message_new',
      COALESCE(group_name, 'Groupe'),
      sender_name || ' : ' || LEFT(NEW.message, 100),
      'group',
      NEW.group_id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- 4. Créer le trigger sur group_messages
DROP TRIGGER IF EXISTS trigger_notify_group_message ON group_messages;
CREATE TRIGGER trigger_notify_group_message
  AFTER INSERT ON group_messages
  FOR EACH ROW EXECUTE FUNCTION notify_on_group_message_insert();
