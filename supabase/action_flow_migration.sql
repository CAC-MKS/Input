-- ============================================================
-- Migration: Action Flow Rules Table
-- Stores action→next-action transition rules editable by admin
-- ============================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.action_flow_rules (
    id SERIAL PRIMARY KEY,
    current_action TEXT NOT NULL,
    current_outcome TEXT NOT NULL,
    current_type TEXT NOT NULL DEFAULT 'ANY',
    next_action TEXT NOT NULL DEFAULT 'Pass',
    next_outcome TEXT,
    next_type TEXT,
    next_action_player TEXT,
    next_reaction_player TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id),
    UNIQUE(current_action, current_outcome, current_type)
);

-- next_action_player / next_reaction_player values:
--   'prevAction'                  = the player who performed the current action
--   'prevReaction'                = the reaction player from current entry
--   'prevReaction_or_prevAction'  = prefer reaction, fallback to action
--   null / ''                     = clear (user picks)

-- 2. RLS
ALTER TABLE action_flow_rules ENABLE ROW LEVEL SECURITY;

-- Everyone can read (tagger needs this)
CREATE POLICY "flow_rules_select" ON action_flow_rules FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Only admins can modify
CREATE POLICY "flow_rules_insert" ON action_flow_rules FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "flow_rules_update" ON action_flow_rules FOR UPDATE
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "flow_rules_delete" ON action_flow_rules FOR DELETE
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 3. Seed ALL action/outcome/type combinations with sensible defaults
-- The defaults match what was previously in actionFlow.js

INSERT INTO action_flow_rules (current_action, current_outcome, current_type, next_action, next_outcome, next_type, next_action_player, next_reaction_player) VALUES
-- ── Pass ──
('Pass', 'Successful', 'Normal Pass', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Successful', 'Goalkick', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Successful', 'Goalkeeper Throw', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Successful', 'Corner Kick', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Successful', 'Free Kick', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Successful', 'Throw-in', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Successful', 'Penalty', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Assist', 'Normal Pass', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Assist', 'Goalkick', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Assist', 'Goalkeeper Throw', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Assist', 'Corner Kick', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Assist', 'Free Kick', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Assist', 'Throw-in', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Assist', 'Penalty', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Key Pass', 'Normal Pass', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Key Pass', 'Goalkick', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Key Pass', 'Goalkeeper Throw', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Key Pass', 'Corner Kick', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Key Pass', 'Free Kick', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Key Pass', 'Throw-in', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Key Pass', 'Penalty', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Missed', 'Normal Pass', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Missed', 'Goalkick', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Missed', 'Goalkeeper Throw', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Missed', 'Corner Kick', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Missed', 'Free Kick', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Missed', 'Throw-in', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Missed', 'Penalty', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Pass', 'Intercepted', 'Normal Pass', 'Pass Intercept', NULL, NULL, NULL, 'prevAction'),
('Pass', 'Intercepted', 'Goalkick', 'Pass Intercept', NULL, NULL, NULL, 'prevAction'),
('Pass', 'Intercepted', 'Goalkeeper Throw', 'Pass Intercept', NULL, NULL, NULL, 'prevAction'),
('Pass', 'Intercepted', 'Corner Kick', 'Pass Intercept', NULL, NULL, NULL, 'prevAction'),
('Pass', 'Intercepted', 'Free Kick', 'Pass Intercept', NULL, NULL, NULL, 'prevAction'),
('Pass', 'Intercepted', 'Throw-in', 'Pass Intercept', NULL, NULL, NULL, 'prevAction'),
('Pass', 'Intercepted', 'Penalty', 'Pass Intercept', NULL, NULL, NULL, 'prevAction'),
('Pass', 'Off-Side', 'Normal Pass', 'Pass', 'Successful', NULL, NULL, NULL),
('Pass', 'Off-Side', 'Goalkick', 'Pass', 'Successful', NULL, NULL, NULL),
('Pass', 'Off-Side', 'Goalkeeper Throw', 'Pass', 'Successful', NULL, NULL, NULL),
('Pass', 'Off-Side', 'Corner Kick', 'Pass', 'Successful', NULL, NULL, NULL),
('Pass', 'Off-Side', 'Free Kick', 'Pass', 'Successful', NULL, NULL, NULL),
('Pass', 'Off-Side', 'Penalty', 'Pass', 'Successful', NULL, NULL, NULL),

-- ── Shoot ──
('Shoot', 'Save', 'Normal', 'Save', NULL, NULL, 'prevReaction', 'prevAction'),
('Shoot', 'Save', 'Penalty', 'Save', NULL, NULL, 'prevReaction', 'prevAction'),
('Shoot', 'Save', 'Free Kick', 'Save', NULL, NULL, 'prevReaction', 'prevAction'),
('Shoot', 'Block', 'Normal', 'Block', NULL, NULL, 'prevReaction', 'prevAction'),
('Shoot', 'Block', 'Penalty', 'Block', NULL, NULL, 'prevReaction', 'prevAction'),
('Shoot', 'Block', 'Free Kick', 'Block', NULL, NULL, 'prevReaction', 'prevAction'),
('Shoot', 'Goal', 'Normal', 'Pass', 'Successful', NULL, NULL, NULL),
('Shoot', 'Goal', 'Penalty', 'Pass', 'Successful', NULL, NULL, NULL),
('Shoot', 'Goal', 'Free Kick', 'Pass', 'Successful', NULL, NULL, NULL),
('Shoot', 'Woodwork', 'Normal', 'Pass', 'Successful', NULL, NULL, NULL),
('Shoot', 'Woodwork', 'Penalty', 'Pass', 'Successful', NULL, NULL, NULL),
('Shoot', 'Woodwork', 'Free Kick', 'Pass', 'Successful', NULL, NULL, NULL),
('Shoot', 'Off-Target', 'Normal', 'Pass', 'Successful', NULL, NULL, NULL),
('Shoot', 'Off-Target', 'Penalty', 'Pass', 'Successful', NULL, NULL, NULL),
('Shoot', 'Off-Target', 'Free Kick', 'Pass', 'Successful', NULL, NULL, NULL),

-- ── Carry ──
('Carry', 'Successful', 'NA', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),

-- ── Dribble ──
('Dribble', 'Successful', 'NA', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Dribble', 'Unsuccessful', 'NA', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Dribble', 'Foul Won', 'NA', 'Discipline', 'Foul', NULL, 'prevReaction', NULL),

-- ── Standing Tackle ──
('Standing Tackle', 'Successful', 'With Possession', 'Pass', 'Successful', NULL, 'prevAction', NULL),
('Standing Tackle', 'Successful', 'Without Possession', 'Pass', 'Successful', NULL, NULL, NULL),
('Standing Tackle', 'Unsuccessful', 'NA', 'Pass', 'Successful', NULL, NULL, NULL),
('Standing Tackle', 'Foul', 'No Card', 'Discipline', 'Foul', NULL, 'prevAction', NULL),
('Standing Tackle', 'Foul', 'Yellow Card', 'Discipline', 'Foul', 'Yellow Card', 'prevAction', NULL),
('Standing Tackle', 'Foul', 'Red Card', 'Discipline', 'Foul', 'Red Card', 'prevAction', NULL),

-- ── Sliding Tackle ──
('Sliding Tackle', 'Successful', 'With Possession', 'Pass', 'Successful', NULL, 'prevAction', NULL),
('Sliding Tackle', 'Successful', 'Without Possession', 'Pass', 'Successful', NULL, NULL, NULL),
('Sliding Tackle', 'Unsuccessful', 'NA', 'Pass', 'Successful', NULL, NULL, NULL),
('Sliding Tackle', 'Foul', 'No Card', 'Discipline', 'Foul', NULL, 'prevAction', NULL),
('Sliding Tackle', 'Foul', 'Yellow Card', 'Discipline', 'Foul', 'Yellow Card', 'prevAction', NULL),
('Sliding Tackle', 'Foul', 'Red Card', 'Discipline', 'Foul', 'Red Card', 'prevAction', NULL),

-- ── Save ──
('Save', 'Gripping', 'NA', 'Pass', 'Successful', 'Goalkeeper Throw', 'prevAction', NULL),
('Save', 'Pushing-in', 'NA', 'Pass', 'Successful', NULL, NULL, NULL),
('Save', 'Pushing-out', 'NA', 'Pass', 'Successful', 'Corner Kick', NULL, NULL),

-- ── Block ──
('Block', 'Successful', 'With Possession', 'Pass', 'Successful', NULL, 'prevAction', NULL),
('Block', 'Successful', 'Without Possession', 'Pass', 'Successful', NULL, NULL, NULL),
('Block', 'Unsuccessful', 'Hand Ball', 'Discipline', 'Foul', NULL, 'prevAction', NULL),
('Block', 'Unsuccessful', 'Own Goal', 'Pass', 'Successful', NULL, NULL, NULL),

-- ── Clearance ──
('Clearance', 'Successful', 'With Possession', 'Pass', 'Successful', NULL, 'prevAction', NULL),
('Clearance', 'Successful', 'Without Possession', 'Pass', 'Successful', NULL, NULL, NULL),
('Clearance', 'Unsuccessful', 'Own Goal', 'Pass', 'Successful', NULL, NULL, NULL),
('Clearance', 'Unsuccessful', 'Without Possession', 'Pass', 'Successful', NULL, NULL, NULL),

-- ── Pass Intercept ──
('Pass Intercept', 'Successful', 'With Possession', 'Pass', 'Successful', NULL, 'prevAction', NULL),
('Pass Intercept', 'Successful', 'Without Possession', 'Pass', 'Successful', NULL, NULL, NULL),
('Pass Intercept', 'Unsuccessful', 'Hand Ball', 'Discipline', 'Foul', NULL, 'prevAction', NULL),
('Pass Intercept', 'Unsuccessful', 'Without Possession', 'Pass', 'Successful', NULL, NULL, NULL),
('Pass Intercept', 'Unsuccessful', 'Own Goal', 'Pass', 'Successful', NULL, NULL, NULL),

-- ── Pressure ──
('Pressure', 'Foul', 'No Card', 'Discipline', 'Foul', NULL, 'prevAction', NULL),

-- ── Through Ball ──
('Through Ball', 'Successful', 'Normal', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Through Ball', 'Successful', 'Assist', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Through Ball', 'Successful', 'Key Pass', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),
('Through Ball', 'Missed', 'Normal', 'Pass', 'Successful', NULL, NULL, NULL),
('Through Ball', 'Missed', 'Off-Side', 'Pass', 'Successful', NULL, NULL, NULL),
('Through Ball', 'Intercepted', 'Normal', 'Pass Intercept', NULL, NULL, NULL, 'prevAction'),

-- ── Discipline ──
('Discipline', 'Foul', 'No Card', 'Pass', 'Successful', 'Free Kick', NULL, NULL),
('Discipline', 'Foul', 'Yellow Card', 'Pass', 'Successful', 'Free Kick', NULL, NULL),
('Discipline', 'Foul', 'Red Card', 'Pass', 'Successful', 'Free Kick', NULL, NULL),

-- ── Substitution ──
('Substitution', 'Off', 'Tactical', 'Pass', 'Successful', NULL, NULL, NULL),
('Substitution', 'Off', 'Injury', 'Pass', 'Successful', NULL, NULL, NULL),

-- ── Ball Control ──
('Ball Control', 'Unsuccessful', 'NA', 'Pass', 'Successful', NULL, 'prevReaction_or_prevAction', NULL),

-- ── Match Time ──
('Match Time', '1st Half', 'Kick-Off', 'Pass', 'Successful', NULL, NULL, NULL),
('Match Time', '1st Half', 'Half Break', 'Pass', 'Successful', NULL, NULL, NULL),
('Match Time', '1st Half', 'Match End', 'Pass', 'Successful', NULL, NULL, NULL),
('Match Time', '2nd Half', 'Kick-Off', 'Pass', 'Successful', NULL, NULL, NULL),
('Match Time', '2nd Half', 'Half Break', 'Pass', 'Successful', NULL, NULL, NULL),
('Match Time', '2nd Half', 'Match End', 'Pass', 'Successful', NULL, NULL, NULL),
('Match Time', '1st Extra Time', 'Kick-Off', 'Pass', 'Successful', NULL, NULL, NULL),
('Match Time', '1st Extra Time', 'Half Break', 'Pass', 'Successful', NULL, NULL, NULL),
('Match Time', '1st Extra Time', 'Match End', 'Pass', 'Successful', NULL, NULL, NULL),
('Match Time', '2nd Extra Time', 'Kick-Off', 'Pass', 'Successful', NULL, NULL, NULL),
('Match Time', '2nd Extra Time', 'Half Break', 'Pass', 'Successful', NULL, NULL, NULL),
('Match Time', '2nd Extra Time', 'Match End', 'Pass', 'Successful', NULL, NULL, NULL),
('Match Time', 'Penalty shootout', 'Kick-Off', 'Pass', 'Successful', NULL, NULL, NULL),
('Match Time', 'Penalty shootout', 'Match End', 'Pass', 'Successful', NULL, NULL, NULL)

ON CONFLICT (current_action, current_outcome, current_type) DO NOTHING;

-- 4. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_flow_rules_lookup ON action_flow_rules(current_action, current_outcome, current_type);
