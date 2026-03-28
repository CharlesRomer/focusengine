-- Google Calendar OAuth columns on users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_access_token  text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_token_expiry  timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar_connected bool DEFAULT false;

-- RLS: users can only update their own google_* columns
-- (The existing "users can update own row" policy covers this,
--  but add an explicit policy if a restrictive one is needed)
CREATE POLICY IF NOT EXISTS "users_update_own_gcal"
  ON users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
