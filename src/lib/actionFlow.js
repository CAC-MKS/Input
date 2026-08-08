// ============================================================
// ACTION FLOW — DB-driven with static fallback
//
// Fetches rules from Supabase action_flow_rules table.
// Falls back to static ACTION_FLOW if DB fetch fails.
// ============================================================

import { supabase } from '../supabase'

// Cached DB rules (loaded once per tagger session)
let dbRules = null;

// ── Load rules from Supabase ──
export async function loadFlowRules() {
    try {
        const { data, error } = await supabase
            .from('action_flow_rules')
            .select('current_action, current_outcome, current_type, next_action, next_outcome, next_type, next_action_player, next_reaction_player');
        if (error) throw error;
        dbRules = data || [];
    } catch (e) {
        console.warn('Failed to load flow rules from DB, using static fallback:', e.message);
        dbRules = null;
    }
}

// ── DEFAULT: used when no rule matches ──
const ACTION_FLOW_DEFAULT = {
    next_action: "Pass",
    next_outcome: "Successful",
    next_type: null,
    next_action_player: "prevReaction_or_prevAction",
    next_reaction_player: null,
};

// ── RESOLVER — called from tagger ──
export function getNextEntry(prevAction, prevOutcome, prevType, prevActionPlayer, prevReactionPlayer) {
    let rule = null;

    if (dbRules && dbRules.length > 0) {
        // Try exact match (action + outcome + type)
        rule = dbRules.find(r =>
            r.current_action === prevAction &&
            r.current_outcome === prevOutcome &&
            r.current_type === prevType
        );
        // Fallback: match action + outcome with ANY type
        if (!rule) {
            rule = dbRules.find(r =>
                r.current_action === prevAction &&
                r.current_outcome === prevOutcome &&
                r.current_type === 'ANY'
            );
        }
        // Fallback: match action + outcome ignoring type
        if (!rule) {
            rule = dbRules.find(r =>
                r.current_action === prevAction &&
                r.current_outcome === prevOutcome
            );
        }
    } else {
        // Static fallback
        rule = STATIC_FLOW.find(r => {
            if (r.current_action !== prevAction) return false;
            if (r.current_outcome && r.current_outcome !== prevOutcome) return false;
            if (r.current_type && r.current_type !== prevType) return false;
            return true;
        });
    }

    const next = rule || ACTION_FLOW_DEFAULT;

    return {
        action:         next.next_action,
        outcome:        next.next_outcome,
        type:           next.next_type,
        actionPlayer:   resolvePlayer(next.next_action_player, prevActionPlayer, prevReactionPlayer),
        reactionPlayer: resolvePlayer(next.next_reaction_player, prevActionPlayer, prevReactionPlayer),
    };
}

function resolvePlayer(value, prevActionPlayer, prevReactionPlayer) {
    if (value === "prevAction")   return prevActionPlayer;
    if (value === "prevReaction") return prevReactionPlayer;
    if (value === "prevReaction_or_prevAction") return prevReactionPlayer || prevActionPlayer;
    return null;
}

// ── Static fallback rules (used if DB is unavailable) ──
const STATIC_FLOW = [
    { current_action: "Pass", current_outcome: "Intercepted", current_type: null, next_action: "Pass Intercept", next_outcome: null, next_type: null, next_action_player: null, next_reaction_player: "prevAction" },
    { current_action: "Through Ball", current_outcome: "Intercepted", current_type: null, next_action: "Pass Intercept", next_outcome: null, next_type: null, next_action_player: null, next_reaction_player: "prevAction" },
    { current_action: "Shoot", current_outcome: "Save", current_type: null, next_action: "Save", next_outcome: null, next_type: null, next_action_player: "prevReaction", next_reaction_player: "prevAction" },
    { current_action: "Shoot", current_outcome: "Block", current_type: null, next_action: "Block", next_outcome: null, next_type: null, next_action_player: "prevReaction", next_reaction_player: "prevAction" },
    { current_action: "Shoot", current_outcome: "Goal", current_type: null, next_action: "Pass", next_outcome: "Successful", next_type: null, next_action_player: null, next_reaction_player: null },
    { current_action: "Standing Tackle", current_outcome: "Successful", current_type: "With Possession", next_action: "Pass", next_outcome: "Successful", next_type: null, next_action_player: "prevAction", next_reaction_player: null },
    { current_action: "Sliding Tackle", current_outcome: "Successful", current_type: "With Possession", next_action: "Pass", next_outcome: "Successful", next_type: null, next_action_player: "prevAction", next_reaction_player: null },
    { current_action: "Standing Tackle", current_outcome: "Successful", current_type: "Without Possession", next_action: "Pass", next_outcome: "Successful", next_type: null, next_action_player: null, next_reaction_player: null },
    { current_action: "Sliding Tackle", current_outcome: "Successful", current_type: "Without Possession", next_action: "Pass", next_outcome: "Successful", next_type: null, next_action_player: null, next_reaction_player: null },
    { current_action: "Standing Tackle", current_outcome: "Unsuccessful", current_type: null, next_action: "Pass", next_outcome: "Successful", next_type: null, next_action_player: null, next_reaction_player: null },
    { current_action: "Sliding Tackle", current_outcome: "Unsuccessful", current_type: null, next_action: "Pass", next_outcome: "Successful", next_type: null, next_action_player: null, next_reaction_player: null },
    { current_action: "Standing Tackle", current_outcome: "Foul", current_type: null, next_action: "Discipline", next_outcome: "Foul", next_type: null, next_action_player: "prevAction", next_reaction_player: null },
    { current_action: "Sliding Tackle", current_outcome: "Foul", current_type: null, next_action: "Discipline", next_outcome: "Foul", next_type: null, next_action_player: "prevAction", next_reaction_player: null },
    { current_action: "Dribble", current_outcome: "Foul Won", current_type: null, next_action: "Discipline", next_outcome: "Foul", next_type: null, next_action_player: "prevReaction", next_reaction_player: null },
    { current_action: "Save", current_outcome: "Gripping", current_type: null, next_action: "Pass", next_outcome: "Successful", next_type: "Goalkeeper Throw", next_action_player: "prevAction", next_reaction_player: null },
    { current_action: "Save", current_outcome: "Pushing-in", current_type: null, next_action: "Pass", next_outcome: "Successful", next_type: null, next_action_player: null, next_reaction_player: null },
    { current_action: "Save", current_outcome: "Pushing-out", current_type: null, next_action: "Pass", next_outcome: "Successful", next_type: "Corner Kick", next_action_player: null, next_reaction_player: null },
    { current_action: "Pressure", current_outcome: "Foul", current_type: null, next_action: "Discipline", next_outcome: "Foul", next_type: null, next_action_player: "prevAction", next_reaction_player: null },
];
