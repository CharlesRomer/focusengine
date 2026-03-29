-- Migration 017: Timeline — project dates + phases table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS end_date DATE;

CREATE TABLE timeline_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_org_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#7C6FE0',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE timeline_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_members_phases" ON timeline_phases
  FOR ALL USING (team_org_id = get_my_team_org_id());

CREATE TRIGGER timeline_phases_updated_at BEFORE UPDATE ON timeline_phases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
