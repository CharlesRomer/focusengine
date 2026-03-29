-- Add is_unplanned flag to focus_sessions for unplanned work tagging
ALTER TABLE focus_sessions
  ADD COLUMN IF NOT EXISTS is_unplanned bool NOT NULL DEFAULT false;
