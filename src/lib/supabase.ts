import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

// ── Database types ─────────────────────────────────────────
export type UserRole = 'member' | 'admin'
export type CommitmentStatus = 'open' | 'done' | 'incomplete'
export type SessionStatus = 'active' | 'paused' | 'ended'
export type ActivityCategory = 'deep_work' | 'meeting' | 'communication' | 'off_task' | 'idle' | 'untracked'

export interface DBUser {
  id: string
  display_name: string
  team_org_id: string | null
  role: UserRole
  avatar_color: string | null
  agent_token: string | null
  active_session_id: string | null
  created_at: string
  google_calendar_connected: boolean | null
}

export interface DBTeam {
  id: string
  name: string
  team_code: string
  created_by: string
  slack_webhook_url: string | null
  created_at: string
}

export interface DBCommitment {
  id: string
  user_id: string
  team_org_id: string
  date: string
  text: string
  status: CommitmentStatus
  proof_url: string | null
  proof_type: 'image' | 'url' | null
  incomplete_reason: string | null
  horizon_tag: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface DBQuickCapture {
  id: string
  user_id: string
  text: string
  commitment_id: string | null
  session_id: string | null
  created_at: string
}

export interface DBFocusSession {
  id: string
  user_id: string
  team_org_id: string
  name: string
  status: SessionStatus
  output_note: string | null
  focus_score: number | null
  share_to_feed: boolean
  started_at: string
  paused_at: string | null
  ended_at: string | null
  total_pause_seconds: number
  is_unplanned?: boolean
}

export interface DBFocusBlock {
  id: string
  user_id: string
  name: string
  date: string
  start_time: string
  end_time: string
  commitment_id: string | null
  horizon_tag: string | null
  session_id: string | null
  created_at: string
  deleted_at: string | null
}

export interface DBActivityEvent {
  id: string
  user_id: string
  team_org_id: string
  raw_event_id: string | null
  app_name: string | null
  bundle_id: string | null
  tab_url: string | null
  tab_title: string | null
  category: ActivityCategory
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  session_id: string | null
}

export interface DBAppClassification {
  id: string
  session_id: string
  user_id: string
  app_name: string
  domain: string | null
  classification: 'focused' | 'distraction'
  duration_seconds: number
  created_at: string
}

export interface DBDailySummary {
  id: string
  user_id: string
  team_org_id: string
  date: string
  total_tracked_seconds: number
  deep_work_seconds: number
  meeting_seconds: number
  comms_seconds: number
  off_task_seconds: number
  focus_score: number | null
  context_switches: number
  commitments_set: number
  commitments_done: number
}
