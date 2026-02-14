-- Migration: tournaments visibility/group_id + RLS
-- Date: 2026-02-14

BEGIN;

-- 1) Columns
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'tous',
  ADD COLUMN IF NOT EXISTS group_id uuid NULL;

-- 2) FK group_id -> groups(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tournaments_group_id_fkey'
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_group_id_fkey
      FOREIGN KEY (group_id)
      REFERENCES public.groups(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3) Business constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tournaments_visibility_check'
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_visibility_check
      CHECK (visibility IN ('tous', 'private'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tournaments_visibility_group_consistency_check'
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_visibility_group_consistency_check
      CHECK (
        (visibility = 'tous' AND group_id IS NULL)
        OR
        (visibility = 'private' AND group_id IS NOT NULL)
      );
  END IF;
END $$;

-- 4) Indexes
CREATE INDEX IF NOT EXISTS idx_tournaments_visibility ON public.tournaments(visibility);
CREATE INDEX IF NOT EXISTS idx_tournaments_group_id ON public.tournaments(group_id);

-- 5) RLS on tournaments
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tournaments are viewable by everyone" ON public.tournaments;
DROP POLICY IF EXISTS "Users can create their own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Users can update their own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Users can delete their own tournaments" ON public.tournaments;

CREATE POLICY "Tournaments visible by access scope"
ON public.tournaments
FOR SELECT
TO authenticated
USING (
  visibility = 'tous'
  OR creator_id = auth.uid()
  OR (
    visibility = 'private'
    AND EXISTS (
      SELECT 1
      FROM public.group_members gm
      WHERE gm.group_id = tournaments.group_id
        AND gm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can create their own tournaments"
ON public.tournaments
FOR INSERT
TO authenticated
WITH CHECK (
  creator_id = auth.uid()
  AND (
    (visibility = 'tous' AND group_id IS NULL)
    OR (
      visibility = 'private'
      AND group_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.group_members gm
        WHERE gm.group_id = tournaments.group_id
          AND gm.user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Users can update their own tournaments"
ON public.tournaments
FOR UPDATE
TO authenticated
USING (creator_id = auth.uid())
WITH CHECK (
  creator_id = auth.uid()
  AND (
    (visibility = 'tous' AND group_id IS NULL)
    OR (
      visibility = 'private'
      AND group_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.group_members gm
        WHERE gm.group_id = tournaments.group_id
          AND gm.user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Users can delete their own tournaments"
ON public.tournaments
FOR DELETE
TO authenticated
USING (creator_id = auth.uid());

-- 6) RLS on tournament_demands
DROP POLICY IF EXISTS "Demands viewable by creator and demander" ON public.tournament_demands;
DROP POLICY IF EXISTS "Users can create their own demands" ON public.tournament_demands;
DROP POLICY IF EXISTS "Tournament creator can update demands" ON public.tournament_demands;
DROP POLICY IF EXISTS "Demand deletable by creator or demander" ON public.tournament_demands;

CREATE POLICY "Demands visible by authorized users"
ON public.tournament_demands
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id = tournament_demands.tournament_id
      AND t.creator_id = auth.uid()
  )
);

CREATE POLICY "Users can create their own demands on visible tournaments"
ON public.tournament_demands
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id = tournament_demands.tournament_id
      AND (
        t.visibility = 'tous'
        OR t.creator_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.group_members gm
          WHERE gm.group_id = t.group_id
            AND gm.user_id = auth.uid()
        )
      )
  )
);

CREATE POLICY "Tournament creator can update demands"
ON public.tournament_demands
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id = tournament_demands.tournament_id
      AND t.creator_id = auth.uid()
  )
);

CREATE POLICY "Demand deletable by creator or demander"
ON public.tournament_demands
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id = tournament_demands.tournament_id
      AND t.creator_id = auth.uid()
  )
);

-- 7) RLS on tournament_messages
DROP POLICY IF EXISTS "Messages viewable by creator and demanders" ON public.tournament_messages;
DROP POLICY IF EXISTS "Messages insertable by creator and demanders" ON public.tournament_messages;

CREATE POLICY "Messages viewable by authorized participants"
ON public.tournament_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id = tournament_messages.tournament_id
      AND (
        t.creator_id = auth.uid()
        OR auth.uid() IN (
          SELECT d.user_id
          FROM public.tournament_demands d
          WHERE d.tournament_id = t.id
        )
      )
  )
);

CREATE POLICY "Messages insertable by authorized participants"
ON public.tournament_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id = tournament_messages.tournament_id
      AND (
        t.creator_id = auth.uid()
        OR auth.uid() IN (
          SELECT d.user_id
          FROM public.tournament_demands d
          WHERE d.tournament_id = t.id
        )
      )
  )
);

COMMIT;
