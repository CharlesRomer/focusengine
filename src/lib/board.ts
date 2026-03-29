export type DBProject = {
  id: string
  team_org_id: string
  name: string
  description: string | null
  status: 'active' | 'archived'
  color: string
  canvas_viewport: { x: number; y: number; zoom: number }
  created_by: string
  created_at: string
  updated_at: string
}

export type DBDepartment = {
  id: string
  project_id: string
  team_org_id: string
  name: string
  position_x: number
  position_y: number
  created_at: string
}

export type DBSubProject = {
  id: string
  project_id: string
  department_id: string | null
  team_org_id: string
  name: string
  description: string | null
  owner_id: string | null
  due_date: string | null
  status: 'not_started' | 'in_progress' | 'blocked' | 'complete'
  position_x: number
  position_y: number
  created_at: string
  updated_at: string
}

export type DBSubProjectTask = {
  id: string
  sub_project_id: string
  team_org_id: string
  title: string
  owner_id: string | null
  is_complete: boolean
  sort_order: number
  proof_url: string | null
  notion_page_id: string | null
  notion_synced_at: string | null
  created_at: string
  updated_at: string
}

export type DBBoardEdge = {
  id: string
  project_id: string
  team_org_id: string
  source_id: string
  source_type: 'project' | 'department' | 'sub_project'
  target_id: string
  target_type: 'department' | 'sub_project' | 'blocker'
  created_at: string
}

export type DBBoardBlocker = {
  id: string
  project_id: string
  team_org_id: string
  title: string
  note: string | null
  is_resolved: boolean
  resolved_at: string | null
  position_x: number
  position_y: number
  created_at: string
  updated_at: string
}

// Sub-project with joined tasks (for node rendering)
export type SubProjectWithTasks = DBSubProject & {
  tasks: DBSubProjectTask[]
  owner: { id: string; display_name: string; avatar_color: string | null } | null
}

// Board member type (for owner dropdowns)
export type BoardMember = {
  id: string
  display_name: string
  avatar_color: string | null
}
