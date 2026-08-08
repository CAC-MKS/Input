-- ============================================================
-- Migration: Multi-Analyst Assignment
-- Replaces single assigned_to UUID with a junction table
-- ============================================================

-- 1. Create junction table
CREATE TABLE IF NOT EXISTS public.match_assignments (
    match_id UUID NOT NULL REFERENCES public.matches(match_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_assignments_user ON match_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_match_assignments_match ON match_assignments(match_id);

-- 2. Migrate existing assigned_to data into junction table
INSERT INTO match_assignments (match_id, user_id)
SELECT match_id, assigned_to
FROM matches
WHERE assigned_to IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. RLS policies for match_assignments
-- IMPORTANT: these must NOT reference the matches table to avoid infinite recursion,
-- since the matches SELECT policy references match_assignments.
ALTER TABLE match_assignments ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read assignments (matches RLS already controls visibility)
CREATE POLICY "assignments_select"
    ON match_assignments FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Creators and admins can insert (use match_id check against matches without triggering matches SELECT policy)
CREATE POLICY "assignments_insert"
    ON match_assignments FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
        OR match_id IN (SELECT m.match_id FROM matches m WHERE m.created_by = auth.uid())
    );

-- Creators and admins can delete
CREATE POLICY "assignments_delete"
    ON match_assignments FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
        OR match_id IN (SELECT m.match_id FROM matches m WHERE m.created_by = auth.uid())
    );

-- 4. Update match SELECT policy to include junction table
DROP POLICY IF EXISTS "matches_select_own_or_assigned_or_admin" ON matches;
CREATE POLICY "matches_select_own_or_assigned_or_admin"
    ON matches FOR SELECT
    USING (
        created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM match_assignments WHERE match_assignments.match_id = matches.match_id AND match_assignments.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'qc'))
    );

-- 5. Update match UPDATE policy to include junction table
DROP POLICY IF EXISTS "matches_update_own_or_assigned_or_admin" ON matches;
CREATE POLICY "matches_update_own_or_assigned_or_admin"
    ON matches FOR UPDATE
    USING (
        created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM match_assignments WHERE match_assignments.match_id = matches.match_id AND match_assignments.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'qc'))
    );

-- 6. Drop the old column (run AFTER verifying migration works)
-- ALTER TABLE matches DROP COLUMN IF EXISTS assigned_to;
