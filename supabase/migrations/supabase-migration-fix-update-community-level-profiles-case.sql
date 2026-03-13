-- Fix: update_community_level() when schema uses public.profiles (lowercase).

CREATE OR REPLACE FUNCTION update_community_level()
RETURNS TRIGGER AS $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    UPDATE public.profiles
    SET community_level = (
      SELECT ROUND(AVG(rating)::numeric, 1)
      FROM match_ratings
      WHERE rated_id = NEW.rated_id
    ),
    community_level_votes = (
      SELECT COUNT(*)
      FROM match_ratings
      WHERE rated_id = NEW.rated_id
    )
    WHERE id = NEW.rated_id;
  ELSE
    RAISE EXCEPTION 'No profiles table found (expected public.profiles)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

