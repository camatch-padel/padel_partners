-- Fix: remplace tous les "Profiles" (capital P) par profiles (minuscule)
-- Fonctions concernees: delete_own_account, notify_on_tournament_demand_insert, notify_on_group_tournament_insert

-- 1. Fix delete_own_account
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

-- 2. Fix notify_on_tournament_demand_insert
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
    tournament_creator_id,
    'tournament_demand_new',
    'Nouvelle demande',
    demander_name || ' souhaite etre votre partenaire pour le tournoi du ' || TO_CHAR(tournament_date, 'DD/MM'),
    'tournament',
    NEW.tournament_id
  );

  RETURN NEW;
END;
$$;

-- 3. Fix notify_on_group_tournament_insert
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
$$;
