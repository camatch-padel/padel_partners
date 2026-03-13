-- Restrict visibility of match ratings to the rater's own notes only
-- while keeping insert/update behavior for community_level computation.

DROP POLICY IF EXISTS "View match ratings" ON match_ratings;
DROP POLICY IF EXISTS "View own match ratings" ON match_ratings;

CREATE POLICY "View own match ratings"
ON match_ratings FOR SELECT TO authenticated
USING (rater_id = auth.uid());
