-- Migration: Tables pour les fonctionnalités avancées des parties
-- Date: 2026-02-09
-- Demandes, Liste d'attente, Résultats, Notation

-- ============================================
-- 1. TABLE match_requests
-- ============================================

CREATE TABLE IF NOT EXISTS match_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES "Profiles"(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_requests_match_id ON match_requests(match_id);
CREATE INDEX IF NOT EXISTS idx_match_requests_user_id ON match_requests(user_id);

-- ============================================
-- 2. TABLE match_waitlist
-- ============================================

CREATE TABLE IF NOT EXISTS match_waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES "Profiles"(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_waitlist_match_id ON match_waitlist(match_id, position);

-- ============================================
-- 3. TABLE match_results
-- ============================================

CREATE TABLE IF NOT EXISTS match_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE UNIQUE,
    -- Équipe 1
    team1_player1_id UUID NOT NULL REFERENCES "Profiles"(id),
    team1_player1_position TEXT CHECK (team1_player1_position IN ('left', 'right')),
    team1_player2_id UUID REFERENCES "Profiles"(id),
    team1_player2_position TEXT CHECK (team1_player2_position IN ('left', 'right')),
    -- Équipe 2
    team2_player1_id UUID NOT NULL REFERENCES "Profiles"(id),
    team2_player1_position TEXT CHECK (team2_player1_position IN ('left', 'right')),
    team2_player2_id UUID REFERENCES "Profiles"(id),
    team2_player2_position TEXT CHECK (team2_player2_position IN ('left', 'right')),
    -- Scores
    sets JSONB NOT NULL DEFAULT '[]',
    winner_team INTEGER CHECK (winner_team IN (1, 2)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_results_match_id ON match_results(match_id);

-- ============================================
-- 4. TABLE match_ratings
-- ============================================

CREATE TABLE IF NOT EXISTS match_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    rater_id UUID NOT NULL REFERENCES "Profiles"(id),
    rated_id UUID NOT NULL REFERENCES "Profiles"(id),
    rating DECIMAL(3,1) NOT NULL CHECK (rating >= 1.0 AND rating <= 10.0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(match_id, rater_id, rated_id)
);

CREATE INDEX IF NOT EXISTS idx_match_ratings_rated_id ON match_ratings(rated_id);

-- ============================================
-- 5. TRIGGER : Mise à jour community_level
-- ============================================

CREATE OR REPLACE FUNCTION update_community_level()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE "Profiles"
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
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_community_level ON match_ratings;
CREATE TRIGGER trigger_update_community_level
    AFTER INSERT OR UPDATE ON match_ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_community_level();

-- ============================================
-- 6. TRIGGER : Promouvoir depuis la liste d'attente
-- ============================================

CREATE OR REPLACE FUNCTION promote_from_waitlist()
RETURNS TRIGGER AS $$
DECLARE
    next_user_id UUID;
    next_entry_id UUID;
    match_format INTEGER;
    current_count INTEGER;
BEGIN
    -- Récupérer le format du match
    SELECT format INTO match_format FROM matches WHERE id = OLD.match_id;

    -- Compter les participants actuels
    SELECT COUNT(*) INTO current_count
    FROM match_participants WHERE match_id = OLD.match_id;

    -- Si la partie n'est plus pleine, promouvoir le premier de la liste
    IF current_count < match_format THEN
        SELECT id, user_id INTO next_entry_id, next_user_id
        FROM match_waitlist
        WHERE match_id = OLD.match_id
        ORDER BY position ASC
        LIMIT 1;

        IF next_user_id IS NOT NULL THEN
            -- Ajouter le joueur comme participant
            INSERT INTO match_participants (match_id, user_id)
            VALUES (OLD.match_id, next_user_id);

            -- Supprimer de la liste d'attente
            DELETE FROM match_waitlist WHERE id = next_entry_id;

            -- Renuméroter les positions
            UPDATE match_waitlist
            SET position = position - 1
            WHERE match_id = OLD.match_id;

            -- Vérifier si la partie est à nouveau pleine
            SELECT COUNT(*) INTO current_count
            FROM match_participants WHERE match_id = OLD.match_id;

            IF current_count >= match_format THEN
                UPDATE matches SET status = 'full' WHERE id = OLD.match_id;
            END IF;
        END IF;

        -- Si la partie n'est plus pleine, mettre en open
        IF current_count < match_format THEN
            UPDATE matches SET status = 'open' WHERE id = OLD.match_id;
        END IF;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_promote_waitlist ON match_participants;
CREATE TRIGGER trigger_promote_waitlist
    AFTER DELETE ON match_participants
    FOR EACH ROW
    EXECUTE FUNCTION promote_from_waitlist();

-- ============================================
-- 7. ACTIVER RLS
-- ============================================

ALTER TABLE match_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_ratings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 8. FONCTIONS HELPER POUR RLS
-- ============================================

-- Vérifie si un utilisateur est participant d'un match
CREATE OR REPLACE FUNCTION is_match_participant(match_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM match_participants
        WHERE match_id = match_uuid AND user_id = user_uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Vérifie si un utilisateur est le créateur d'un match
CREATE OR REPLACE FUNCTION is_match_creator(match_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM matches
        WHERE id = match_uuid AND creator_id = user_uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 9. POLITIQUES RLS - match_requests
-- ============================================

-- Voir les demandes : créateur du match ou demandeur
CREATE POLICY "View match requests"
ON match_requests FOR SELECT TO authenticated
USING (
    user_id = auth.uid() OR is_match_creator(match_id)
);

-- Créer une demande : tout utilisateur authentifié
CREATE POLICY "Create match request"
ON match_requests FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Modifier une demande : créateur du match uniquement (accepter/refuser)
CREATE POLICY "Update match request"
ON match_requests FOR UPDATE TO authenticated
USING (is_match_creator(match_id));

-- Supprimer une demande : le demandeur ou le créateur
CREATE POLICY "Delete match request"
ON match_requests FOR DELETE TO authenticated
USING (user_id = auth.uid() OR is_match_creator(match_id));

-- ============================================
-- 10. POLITIQUES RLS - match_waitlist
-- ============================================

-- Voir la liste d'attente : tout utilisateur authentifié
CREATE POLICY "View match waitlist"
ON match_waitlist FOR SELECT TO authenticated
USING (true);

-- S'ajouter à la liste d'attente
CREATE POLICY "Join match waitlist"
ON match_waitlist FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Se retirer ou créateur retire
CREATE POLICY "Leave match waitlist"
ON match_waitlist FOR DELETE TO authenticated
USING (user_id = auth.uid() OR is_match_creator(match_id));

-- ============================================
-- 11. POLITIQUES RLS - match_results
-- ============================================

-- Voir les résultats : tout utilisateur authentifié
CREATE POLICY "View match results"
ON match_results FOR SELECT TO authenticated
USING (true);

-- Créer des résultats : participants du match
CREATE POLICY "Create match results"
ON match_results FOR INSERT TO authenticated
WITH CHECK (is_match_participant(match_id) OR is_match_creator(match_id));

-- Modifier les résultats : participants du match
CREATE POLICY "Update match results"
ON match_results FOR UPDATE TO authenticated
USING (is_match_participant(match_id) OR is_match_creator(match_id));

-- ============================================
-- 12. POLITIQUES RLS - match_ratings
-- ============================================

-- Voir les notes : tout utilisateur authentifié
CREATE POLICY "View match ratings"
ON match_ratings FOR SELECT TO authenticated
USING (true);

-- Créer une note : participant du match, ne peut pas se noter soi-même
CREATE POLICY "Create match rating"
ON match_ratings FOR INSERT TO authenticated
WITH CHECK (
    rater_id = auth.uid()
    AND rated_id != auth.uid()
    AND is_match_participant(match_id)
);

-- Modifier sa note
CREATE POLICY "Update match rating"
ON match_ratings FOR UPDATE TO authenticated
USING (rater_id = auth.uid());

-- ============================================
-- 13. VÉRIFICATION
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Tables match_requests, match_waitlist, match_results, match_ratings créées';
    RAISE NOTICE 'Triggers update_community_level et promote_from_waitlist créés';
    RAISE NOTICE 'RLS activé avec politiques pour toutes les tables';
END $$;
