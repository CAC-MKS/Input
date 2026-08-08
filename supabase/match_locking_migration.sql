-- ============================================================
-- CAC Public Tagger — Match Locking & Analyst Assignment
-- Run this in Supabase Dashboard → SQL Editor
-- Enables real-time collaboration awareness and match delegation
-- ============================================================

-- 1. Add locking columns (who is currently editing)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES auth.users(id);
ALTER TABLE matches ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

-- 2. Add analyst assignment (who is assigned to tag this match)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id);

-- 3. Performance indexes
CREATE INDEX IF NOT EXISTS idx_matches_locked_by ON matches(locked_by);
CREATE INDEX IF NOT EXISTS idx_matches_assigned_to ON matches(assigned_to);

-- ============================================================
-- 4. Auto-release stale locks (after 10 minutes of no heartbeat)
-- ============================================================
CREATE OR REPLACE FUNCTION release_stale_locks()
RETURNS void AS $$
BEGIN
    UPDATE matches
    SET locked_by = NULL, locked_at = NULL
    WHERE locked_at < NOW() - INTERVAL '10 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. Acquire lock — returns true if lock acquired, false if busy
-- ============================================================
CREATE OR REPLACE FUNCTION acquire_match_lock(p_match_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    current_lock UUID;
    lock_time TIMESTAMPTZ;
BEGIN
    -- Release stale locks first
    PERFORM release_stale_locks();

    -- Check current lock status
    SELECT locked_by, locked_at INTO current_lock, lock_time
    FROM matches WHERE match_id = p_match_id;

    -- If no lock or same user already has it → grant
    IF current_lock IS NULL OR current_lock = p_user_id THEN
        UPDATE matches
        SET locked_by = p_user_id, locked_at = NOW()
        WHERE match_id = p_match_id;
        RETURN TRUE;
    END IF;

    -- Someone else has the lock
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. Refresh lock heartbeat (extend the lock timestamp)
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_match_lock(p_match_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    current_lock UUID;
BEGIN
    SELECT locked_by INTO current_lock FROM matches WHERE match_id = p_match_id;

    IF current_lock = p_user_id THEN
        UPDATE matches SET locked_at = NOW() WHERE match_id = p_match_id;
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. Release lock
-- ============================================================
CREATE OR REPLACE FUNCTION release_match_lock(p_match_id UUID, p_user_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE matches
    SET locked_by = NULL, locked_at = NULL
    WHERE match_id = p_match_id
    AND (locked_by = p_user_id OR locked_by IS NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 8. Assign match to another analyst
-- ============================================================
CREATE OR REPLACE FUNCTION assign_match(p_match_id UUID, p_assigner_id UUID, p_assignee_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    match_creator UUID;
    assigner_role TEXT;
BEGIN
    -- Check assigner is the creator or an admin
    SELECT created_by INTO match_creator FROM matches WHERE match_id = p_match_id;
    SELECT role INTO assigner_role FROM profiles WHERE id = p_assigner_id;

    IF match_creator = p_assigner_id OR assigner_role = 'admin' THEN
        UPDATE matches SET assigned_to = p_assignee_id WHERE match_id = p_match_id;
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 9. Update RLS: allow assigned analysts to see/edit matches
-- ============================================================
-- Drop old policies and recreate with assignment support
DROP POLICY IF EXISTS "matches_select_own_or_admin" ON matches;
CREATE POLICY "matches_select_own_or_assigned_or_admin"
    ON matches FOR SELECT
    USING (
        created_by = auth.uid()
        OR assigned_to = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'qc'))
    );

DROP POLICY IF EXISTS "matches_update_own_or_admin" ON matches;
CREATE POLICY "matches_update_own_or_assigned_or_admin"
    ON matches FOR UPDATE
    USING (
        created_by = auth.uid()
        OR assigned_to = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'qc'))
    );
