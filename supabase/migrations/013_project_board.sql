-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_org_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  color TEXT NOT NULL DEFAULT '#7C6FE0',
  canvas_viewport JSONB DEFAULT '{"x": 0, "y": 0, "zoom": 1}',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Department nodes (Marketing, Product, Operations, etc.)
CREATE TABLE board_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_org_id UUID NOT NULL,
  name TEXT NOT NULL,
  position_x FLOAT NOT NULL DEFAULT 0,
  position_y FLOAT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sub-projects (the main work units)
CREATE TABLE sub_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  department_id UUID REFERENCES board_departments(id) ON DELETE SET NULL,
  team_org_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'blocked', 'complete')),
  position_x FLOAT NOT NULL DEFAULT 0,
  position_y FLOAT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tasks inside sub-projects
CREATE TABLE sub_project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_project_id UUID NOT NULL REFERENCES sub_projects(id) ON DELETE CASCADE,
  team_org_id UUID NOT NULL,
  title TEXT NOT NULL,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_complete BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  notion_page_id TEXT,
  notion_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Edges between nodes (dependencies)
CREATE TABLE board_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_org_id UUID NOT NULL,
  source_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('project', 'department', 'sub_project')),
  target_id UUID NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('department', 'sub_project', 'blocker')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Blocker nodes (red, sit between sub-projects on the canvas)
CREATE TABLE board_blockers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_org_id UUID NOT NULL,
  title TEXT NOT NULL,
  note TEXT,
  is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  position_x FLOAT NOT NULL DEFAULT 0,
  position_y FLOAT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_blockers ENABLE ROW LEVEL SECURITY;

-- Projects RLS
CREATE POLICY "team_members_projects" ON projects
  FOR ALL USING (team_org_id = get_my_team_org_id());

-- Departments RLS
CREATE POLICY "team_members_departments" ON board_departments
  FOR ALL USING (team_org_id = get_my_team_org_id());

-- Sub-projects RLS
CREATE POLICY "team_members_sub_projects" ON sub_projects
  FOR ALL USING (team_org_id = get_my_team_org_id());

-- Tasks RLS
CREATE POLICY "team_members_tasks" ON sub_project_tasks
  FOR ALL USING (team_org_id = get_my_team_org_id());

-- Edges RLS
CREATE POLICY "team_members_edges" ON board_edges
  FOR ALL USING (team_org_id = get_my_team_org_id());

-- Blockers RLS
CREATE POLICY "team_members_blockers" ON board_blockers
  FOR ALL USING (team_org_id = get_my_team_org_id());

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER sub_projects_updated_at BEFORE UPDATE ON sub_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER sub_project_tasks_updated_at BEFORE UPDATE ON sub_project_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER board_blockers_updated_at BEFORE UPDATE ON board_blockers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
