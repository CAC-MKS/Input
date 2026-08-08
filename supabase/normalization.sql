-- ----------------------------------------------------------------
-- 1. Standardize Foreign Key Constraint Names
-- This fixes the "Could not embed... more than one relationship" error
-- by giving the join hints a unique, non-ambiguous target.
-- ----------------------------------------------------------------

-- Match Events
ALTER TABLE IF EXISTS match_events 
  DROP CONSTRAINT IF EXISTS match_events_player_id_fkey,
  DROP CONSTRAINT IF EXISTS match_events_reaction_player_id_fkey;

ALTER TABLE match_events
  ADD CONSTRAINT match_events_player_id_fkey 
    FOREIGN KEY (player_id) REFERENCES players(player_id),
  ADD CONSTRAINT match_events_reaction_player_id_fkey 
    FOREIGN KEY (reaction_player_id) REFERENCES players(player_id);

-- Processed Match Events
ALTER TABLE IF EXISTS processed_match_events 
  DROP CONSTRAINT IF EXISTS processed_match_events_player_id_fkey,
  DROP CONSTRAINT IF EXISTS processed_match_events_reaction_player_id_fkey;

ALTER TABLE processed_match_events
  ADD CONSTRAINT processed_match_events_player_id_fkey 
    FOREIGN KEY (player_id) REFERENCES players(player_id),
  ADD CONSTRAINT processed_match_events_reaction_player_id_fkey 
    FOREIGN KEY (reaction_player_id) REFERENCES players(player_id);


-- ----------------------------------------------------------------
-- 2. Data Merging Logic (RPCs)
-- ----------------------------------------------------------------

-- Merge Teams (e.g., 'Man City' -> 'Manchester City')
CREATE OR REPLACE FUNCTION merge_teams(source_id UUID, target_id UUID) 
RETURNS VOID AS $$
BEGIN
  -- Update all matches referencing the source team
  UPDATE matches SET home_team_id = target_id WHERE home_team_id = source_id;
  UPDATE matches SET away_team_id = target_id WHERE away_team_id = source_id;
  
  -- Update all players referencing the source team
  UPDATE players SET team_id = target_id WHERE team_id = source_id;
  
  -- Delete the source team
  DELETE FROM teams WHERE team_id = source_id;
END;
$$ LANGUAGE plpgsql;

-- Merge Players
CREATE OR REPLACE FUNCTION merge_players(source_id UUID, target_id UUID) 
RETURNS VOID AS $$
BEGIN
  -- Update all match_events
  UPDATE match_events SET player_id = target_id WHERE player_id = source_id;
  UPDATE match_events SET reaction_player_id = target_id WHERE reaction_player_id = source_id;
  
  -- Update processed_match_events
  UPDATE processed_match_events SET player_id = target_id WHERE player_id = source_id;
  UPDATE processed_match_events SET reaction_player_id = target_id WHERE reaction_player_id = source_id;
  
  -- Update lineups
  UPDATE lineups SET player_id = target_id WHERE player_id = source_id;
  
  -- Delete the source player
  DELETE FROM players WHERE player_id = source_id;
END;
$$ LANGUAGE plpgsql;
