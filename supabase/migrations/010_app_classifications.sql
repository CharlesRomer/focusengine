-- app_classifications: user-driven session app labels (Part 2 / Part 6)
CREATE TABLE IF NOT EXISTS app_classifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid REFERENCES focus_sessions(id) NOT NULL,
  user_id           uuid REFERENCES users(id) NOT NULL,
  app_name          text NOT NULL,
  domain            text,
  classification    text NOT NULL CHECK (classification IN ('focused','distraction')),
  duration_seconds  int  NOT NULL,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE app_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own classifications"
  ON app_classifications FOR ALL
  USING (user_id = auth.uid());
