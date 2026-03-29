-- Add sub_project_id to commitments for Board integration
ALTER TABLE commitments ADD COLUMN sub_project_id UUID REFERENCES sub_projects(id) ON DELETE SET NULL;

-- Add notion_connected flag to users table
ALTER TABLE users ADD COLUMN notion_connected BOOLEAN NOT NULL DEFAULT FALSE;
