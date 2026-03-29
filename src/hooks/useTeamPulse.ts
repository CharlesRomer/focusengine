import { useQuery } from '@tanstack/react-query'
import { startOfWeek, endOfWeek } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { DBCommitment } from '@/lib/supabase'

const STALE = 30_000 // 30s — realtime keeps data fresh

// ── Team members ──────────────────────────────────────────────────
export interface TeamMember {
  id: string
  display_name: string
  active_session_id: string | null
  role: string
}

export function useTeamMembers(teamOrgId: string) {
  return useQuery({
    queryKey: ['team-members', teamOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, display_name, active_session_id, role')
        .eq('team_org_id', teamOrgId)
        .order('display_name')
      if (error) throw error
      return (data ?? []) as TeamMember[]
    },
    staleTime: STALE,
  })
}

// ── Active sessions for entire team ──────────────────────────────
export interface TeamSession {
  id: string
  user_id: string
  name: string
  status: 'active' | 'paused' | 'ended'
  started_at: string
  total_pause_seconds: number
  focus_score: number | null
  is_unplanned?: boolean
}

export function useTeamActiveSessions(teamOrgId: string) {
  return useQuery({
    queryKey: ['team-active-sessions', teamOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('focus_sessions')
        .select('id, user_id, name, status, started_at, total_pause_seconds, focus_score, is_unplanned')
        .eq('team_org_id', teamOrgId)
        .in('status', ['active', 'paused'])
      if (error) throw error
      return (data ?? []) as TeamSession[]
    },
    staleTime: STALE,
  })
}

// ── Last activity per member (last 7 days) ────────────────────────
export interface LastActivity {
  appName: string | null
  lastActiveAt: string
}

export function useTeamLastActivity(teamOrgId: string) {
  return useQuery({
    queryKey: ['team-last-activity', teamOrgId],
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('activity_events')
        .select('user_id, app_name, started_at')
        .eq('team_org_id', teamOrgId)
        .gte('started_at', sevenDaysAgo)
        .order('started_at', { ascending: false })
        .limit(500)
      if (error) throw error
      // Most recent event per user
      const byUser = new Map<string, LastActivity>()
      for (const ev of data ?? []) {
        if (!byUser.has(ev.user_id)) {
          byUser.set(ev.user_id, { appName: ev.app_name, lastActiveAt: ev.started_at })
        }
      }
      return byUser
    },
    staleTime: STALE,
  })
}

// ── Today's commitments for all team members ──────────────────────
export function useTeamTodayCommitments(teamOrgId: string) {
  const today = new Date().toISOString().slice(0, 10)
  return useQuery({
    queryKey: ['team-today-commitments', teamOrgId, today],
    queryFn: async () => {
      // Do NOT filter by deleted_at — show soft-deleted as incomplete
      const { data, error } = await supabase
        .from('commitments')
        .select('id, user_id, text, status, proof_url, incomplete_reason, deleted_at, created_at')
        .eq('team_org_id', teamOrgId)
        .eq('date', today)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Pick<
        DBCommitment,
        'id' | 'user_id' | 'text' | 'status' | 'proof_url' | 'incomplete_reason' | 'deleted_at' | 'created_at'
      >[]
    },
    staleTime: STALE,
  })
}

// ── Weekly commitment stats (per member + daily for sparkline) ────
export interface WeeklyCommitmentStats {
  byUser: Map<string, { totalSet: number; totalDone: number }>
  byDate: { date: string; totalSet: number; totalDone: number }[]
}

export function useWeeklyCommitments(teamOrgId: string) {
  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString().slice(0, 10)
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 }).toISOString().slice(0, 10)

  return useQuery({
    queryKey: ['team-weekly-commitments', teamOrgId, weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commitments')
        .select('user_id, date, status, deleted_at')
        .eq('team_org_id', teamOrgId)
        .gte('date', weekStart)
        .lte('date', weekEnd)
      if (error) throw error

      const rows = data ?? []

      // Per-user aggregation
      const byUser = new Map<string, { totalSet: number; totalDone: number }>()
      for (const r of rows) {
        if (!byUser.has(r.user_id)) byUser.set(r.user_id, { totalSet: 0, totalDone: 0 })
        const u = byUser.get(r.user_id)!
        u.totalSet++
        if (r.status === 'done') u.totalDone++
      }

      // Per-date aggregation
      const dateMap = new Map<string, { totalSet: number; totalDone: number }>()
      for (const r of rows) {
        if (!dateMap.has(r.date)) dateMap.set(r.date, { totalSet: 0, totalDone: 0 })
        const d = dateMap.get(r.date)!
        d.totalSet++
        if (r.status === 'done') d.totalDone++
      }
      const byDate = Array.from(dateMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v }))

      return { byUser, byDate } as WeeklyCommitmentStats
    },
    staleTime: STALE,
  })
}

// ── Weekly session stats per member ──────────────────────────────
export interface WeeklySessionStats {
  sessionCount: number
  avgScore: number | null
}

export function useWeeklySessionStats(teamOrgId: string) {
  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString()
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 }).toISOString()

  return useQuery({
    queryKey: ['team-weekly-sessions', teamOrgId, weekStart.slice(0, 10)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('focus_sessions')
        .select('user_id, focus_score')
        .eq('team_org_id', teamOrgId)
        .eq('status', 'ended')
        .gte('started_at', weekStart)
        .lte('started_at', weekEnd)
      if (error) throw error

      const byUser = new Map<string, WeeklySessionStats>()
      const scoreMap = new Map<string, number[]>()

      for (const r of data ?? []) {
        if (!byUser.has(r.user_id)) byUser.set(r.user_id, { sessionCount: 0, avgScore: null })
        byUser.get(r.user_id)!.sessionCount++
        if (r.focus_score !== null) {
          if (!scoreMap.has(r.user_id)) scoreMap.set(r.user_id, [])
          scoreMap.get(r.user_id)!.push(r.focus_score)
        }
      }

      for (const [uid, scores] of scoreMap.entries()) {
        if (byUser.has(uid) && scores.length > 0) {
          byUser.get(uid)!.avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        }
      }

      return byUser
    },
    staleTime: STALE,
  })
}

// ── Weekly deep work per member ───────────────────────────────────
export function useWeeklyDeepWork(teamOrgId: string) {
  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString()
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 }).toISOString()

  return useQuery({
    queryKey: ['team-weekly-deepwork', teamOrgId, weekStart.slice(0, 10)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_events')
        .select('user_id, duration_seconds')
        .eq('team_org_id', teamOrgId)
        .eq('category', 'deep_work')
        .gte('started_at', weekStart)
        .lte('started_at', weekEnd)
        .not('duration_seconds', 'is', null)
      if (error) throw error

      const byUser = new Map<string, number>()
      for (const r of data ?? []) {
        byUser.set(r.user_id, (byUser.get(r.user_id) ?? 0) + (r.duration_seconds ?? 0))
      }
      return byUser // user_id → deep_work_seconds
    },
    staleTime: STALE,
  })
}
