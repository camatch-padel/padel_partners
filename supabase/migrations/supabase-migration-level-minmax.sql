-- Migration pour ajouter level_min et level_max à la place de level_required
-- À exécuter dans la console SQL de Supabase

-- 1. Ajouter les nouvelles colonnes
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS level_min DECIMAL(3,1),
ADD COLUMN IF NOT EXISTS level_max DECIMAL(3,1);

-- 2. Migrer les données existantes (si la colonne level_required existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'level_required'
  ) THEN
    UPDATE matches
    SET level_min = level_required,
        level_max = level_required
    WHERE level_required IS NOT NULL
      AND (level_min IS NULL OR level_max IS NULL);
  END IF;
END $$;

-- 3. Supprimer l'ancienne colonne level_required
ALTER TABLE matches DROP COLUMN IF EXISTS level_required;

-- 4. Supprimer les contraintes existantes si elles existent
ALTER TABLE matches DROP CONSTRAINT IF EXISTS check_level_min;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS check_level_max;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS check_level_range;

-- 5. Mettre les colonnes en NOT NULL si elles ne le sont pas déjà
DO $$
BEGIN
  -- Set level_min to NOT NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches'
    AND column_name = 'level_min'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE matches ALTER COLUMN level_min SET NOT NULL;
  END IF;

  -- Set level_max to NOT NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches'
    AND column_name = 'level_max'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE matches ALTER COLUMN level_max SET NOT NULL;
  END IF;
END $$;

-- 6. Ajouter les nouvelles contraintes
ALTER TABLE matches
ADD CONSTRAINT check_level_min CHECK (level_min >= 1.0 AND level_min <= 10.0),
ADD CONSTRAINT check_level_max CHECK (level_max >= 1.0 AND level_max <= 10.0),
ADD CONSTRAINT check_level_range CHECK (level_min <= level_max);
