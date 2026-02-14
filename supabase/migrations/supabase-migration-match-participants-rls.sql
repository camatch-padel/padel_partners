-- Fix RLS policy for match_participants
-- Permet au créateur de la partie d'ajouter des participants (accepter des demandes)

-- Supprimer l'ancienne politique d'insertion si elle existe
DROP POLICY IF EXISTS "Users can join matches" ON match_participants;
DROP POLICY IF EXISTS "Anyone can join matches" ON match_participants;
DROP POLICY IF EXISTS "insert_match_participants" ON match_participants;

-- Nouvelle politique : un utilisateur peut s'inscrire lui-même OU le créateur de la partie peut ajouter un participant
CREATE POLICY "Users can join matches or creator can add"
ON match_participants
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  OR
  auth.uid() IN (
    SELECT creator_id FROM matches WHERE id = match_id
  )
);

-- Politique de suppression : un utilisateur peut se retirer ou le créateur peut retirer un participant
DROP POLICY IF EXISTS "Users can leave matches" ON match_participants;
DROP POLICY IF EXISTS "delete_match_participants" ON match_participants;

CREATE POLICY "Users can leave or creator can remove"
ON match_participants
FOR DELETE
USING (
  auth.uid() = user_id
  OR
  auth.uid() IN (
    SELECT creator_id FROM matches WHERE id = match_id
  )
);

-- Politique de lecture : tout le monde peut voir les participants
DROP POLICY IF EXISTS "Anyone can view participants" ON match_participants;
DROP POLICY IF EXISTS "select_match_participants" ON match_participants;

CREATE POLICY "Anyone can view participants"
ON match_participants
FOR SELECT
USING (true);
