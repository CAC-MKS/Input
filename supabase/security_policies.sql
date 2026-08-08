-- ============================================================
-- CAC Public Tagger — Row Level Security (RLS) Policies
-- Run this in Supabase Dashboard → SQL Editor
-- This protects your data so 20+ users can't see/edit each other's work
-- ============================================================

-- 1. Enable RLS on all tables
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. PROFILES — users can read all profiles but only edit their own
-- ============================================================
CREATE POLICY "profiles_select_all"
    ON profiles FOR SELECT
    USING (true);

CREATE POLICY "profiles_update_own"
    ON profiles FOR UPDATE
    USING (id = auth.uid());

-- Profiles are auto-created by trigger — allow insert for new users
CREATE POLICY "profiles_insert_own"
    ON profiles FOR INSERT
    WITH CHECK (id = auth.uid());

-- ============================================================
-- 3. TEAMS — shared resource, anyone can read, only creator can edit/delete
-- ============================================================
CREATE POLICY "teams_select_all"
    ON teams FOR SELECT
    USING (true);

CREATE POLICY "teams_insert_auth"
    ON teams FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "teams_update_creator_or_admin"
    ON teams FOR UPDATE
    USING (
        created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================================
-- 4. PLAYERS — shared resource, similar to teams
-- ============================================================
CREATE POLICY "players_select_all"
    ON players FOR SELECT
    USING (true);

CREATE POLICY "players_insert_auth"
    ON players FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "players_update_admin"
    ON players FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================================
-- 5. MATCHES — user can see/edit only their own matches; admin sees all
-- ============================================================
CREATE POLICY "matches_select_own_or_admin"
    ON matches FOR SELECT
    USING (
        created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'qc'))
    );

CREATE POLICY "matches_insert_own"
    ON matches FOR INSERT
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "matches_update_own_or_admin"
    ON matches FOR UPDATE
    USING (
        created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'qc'))
    );

CREATE POLICY "matches_delete_own_or_admin"
    ON matches FOR DELETE
    USING (
        created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================================
-- 6. MATCH_EVENTS — linked to match ownership
-- ============================================================
CREATE POLICY "events_select_match_owner_or_admin"
    ON match_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM matches
            WHERE matches.match_id = match_events.match_id
            AND (matches.created_by = auth.uid()
                 OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'qc')))
        )
    );

CREATE POLICY "events_insert_match_owner"
    ON match_events FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM matches
            WHERE matches.match_id = match_events.match_id
            AND (matches.created_by = auth.uid()
                 OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'qc')))
        )
    );

CREATE POLICY "events_update_match_owner_or_admin"
    ON match_events FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM matches
            WHERE matches.match_id = match_events.match_id
            AND (matches.created_by = auth.uid()
                 OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'qc')))
        )
    );

CREATE POLICY "events_delete_match_owner_or_admin"
    ON match_events FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM matches
            WHERE matches.match_id = match_events.match_id
            AND (matches.created_by = auth.uid()
                 OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'qc')))
        )
    );

-- ============================================================
-- 7. PROCESSED_MATCH_EVENTS — same as match_events
-- ============================================================
CREATE POLICY "processed_select"
    ON processed_match_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM matches
            WHERE matches.match_id = processed_match_events.match_id
            AND (matches.created_by = auth.uid()
                 OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'qc')))
        )
    );

CREATE POLICY "processed_insert"
    ON processed_match_events FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM matches
            WHERE matches.match_id = processed_match_events.match_id
            AND (matches.created_by = auth.uid()
                 OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'qc')))
        )
    );

CREATE POLICY "processed_delete"
    ON processed_match_events FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM matches
            WHERE matches.match_id = processed_match_events.match_id
            AND (matches.created_by = auth.uid()
                 OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'qc')))
        )
    );

-- ============================================================
-- 8. LINEUPS — linked to match ownership
-- ============================================================
CREATE POLICY "lineups_select"
    ON lineups FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM matches
            WHERE matches.match_id = lineups.match_id
            AND (matches.created_by = auth.uid()
                 OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'qc')))
        )
    );

CREATE POLICY "lineups_insert"
    ON lineups FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM matches
            WHERE matches.match_id = lineups.match_id
            AND matches.created_by = auth.uid()
        )
    );

-- ============================================================
-- 9. DATABASE INDEXES for performance with 20+ concurrent users
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_match_events_match_id ON match_events(match_id);
CREATE INDEX IF NOT EXISTS idx_match_events_player_id ON match_events(player_id);
CREATE INDEX IF NOT EXISTS idx_match_events_time ON match_events(match_id, match_time_seconds);
CREATE INDEX IF NOT EXISTS idx_processed_events_match_id ON processed_match_events(match_id);
CREATE INDEX IF NOT EXISTS idx_lineups_match_id ON lineups(match_id);
CREATE INDEX IF NOT EXISTS idx_lineups_player_id ON lineups(player_id);
CREATE INDEX IF NOT EXISTS idx_matches_created_by ON matches(created_by);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- ============================================================
-- 10. Rate limiting function for RPC calls (optional)
-- ============================================================
-- You can also configure rate limiting in Supabase Dashboard:
-- Settings → API → Rate Limiting
