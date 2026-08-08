-- Add shot metadata columns to match_events
ALTER TABLE match_events
ADD COLUMN shot_technique TEXT,
ADD COLUMN first_time_shot SMALLINT,
ADD COLUMN assist_type TEXT;

-- Add shot metadata columns to processed_match_events
ALTER TABLE processed_match_events
ADD COLUMN shot_technique TEXT,
ADD COLUMN first_time_shot SMALLINT,
ADD COLUMN assist_type TEXT;
