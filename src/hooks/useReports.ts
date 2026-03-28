import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getWindowBounds, type TimeWindow } from '@/lib/reports'
import type { DBActivityEvent, DBFocusSession, DBCommitment, DBUser } from '@/lib/supabase'

const STALE = 5 * 60 * 1000 // 5 minutes

// ── Activity events for a window ──────────────────────────────────
export function useActivityInWindow(userId: string, window: TimeWindow) {
  const { start, end } = getWindowBounds(window)
  return useQuery({
    queryKey: ['activity-window', userId, start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_events')
        .select('*')
        .eq('user_id', userId)
        .gte('started_at', start.toISOString())
        .lte('started_at', end.toISOString())
        .not('duration_seconds', 'is', null)
        .order('started_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as DBActivityEvent[]
    },
    staleTime: STALE,
  })
}

// ── Activity events always last 30 days (for heatmap) ────────────
export function useActivityLast30Days(userId: string) {
  const { start, end } = getWindowBounds('30days')
  return useQuery({
    queryKey: ['activity-30d', userId, start.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_events')
        .select('started_at, duration_seconds, category')
        .eq('user_id', userId)
        .neq('category', 'idle')
        .gte('started_at', start.toISOString())
        .lte('started_at', end.toISOString())
        .not('duration_seconds', 'is', null)
      if (error) throw error
      return (data ?? []) as Pick<DBActivityEvent, 'started_at' | 'duration_seconds' | 'category'>[]
    },
    staleTime: STALE,
  })
}

// ── Focus sessions for a window ───────────────────────────────────
export function useSessionsInWindow(userId: string, window: TimeWindow) {
  const { start, end } = getWindowBounds(window)
  return useQuery({
    queryKey: ['sessions-window', userId, start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('focus_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'ended')
        .gte('started_at', start.toISOString())
        .lte('started_at', end.toISOString())
        .order('started_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as DBFocusSession[]
    },
    staleTime: STALE,
  })
}

// ── Focus score trend (daily) ─────────────────────────────────────
export function useFocusScoreTrend(userId: string, window: TimeWindow) {
  const { start, end } = getWindowBounds(window)
  return useQuery({
    queryKey: ['score-trend', userId, start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('focus_sessions')
        .select('started_at, focus_score')
        .eq('user_id', userId)
        .eq('status', 'ended')
        .not('focus_score', 'is', null)
        .gte('started_at', start.toISOString())
        .lte('started_at', end.toISOString())
        .order('started_at', { ascending: true })
      if (error) throw error
      // Group by date, average score per day
      const byDate: Record<string, number[]> = {}
      for (const row of data ?? []) {
        const d = row.started_at.slice(0, 10)
        if (!byDate[d]) byDate[d] = []
        byDate[d].push(row.focus_score as number)
      }
      return Object.entries(byDate).map(([date, scores]) => ({
        date,
        score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      }))
    },
    staleTime: STALE,
  })
}

// ── Commitments for a window ──────────────────────────────────────
export function useCommitmentsInWindow(userId: string, window: TimeWindow) {
  const { start, end } = getWindowBounds(window)
  const startDate = start.toISOString().slice(0, 10)
  const endDate = end.toISOString().slice(0, 10)
  return useQuery({
    queryKey: ['commitments-window', userId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commitments')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .is('deleted_at', null)
        .order('date', { ascending: true })
      if (error) throw error
      return (data ?? []) as DBCommitment[]
    },
    staleTime: STALE,
  })
}

// ── Per-app breakdown ─────────────────────────────────────────────
export function useAppBreakdown(userId: string, window: TimeWindow) {
  const { start, end } = getWindowBounds(window)
  return useQuery({
    queryKey: ['app-breakdown', userId, start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_events')
        .select('app_name, bundle_id, tab_url, category, duration_seconds')
        .eq('user_id', userId)
        .neq('category', 'idle')
        .gte('started_at', start.toISOString())
        .lte('started_at', end.toISOString())
        .not('duration_seconds', 'is', null)
      if (error) throw error
      return (data ?? []) as Pick<DBActivityEvent, 'app_name' | 'bundle_id' | 'tab_url' | 'category' | 'duration_seconds'>[]
    },
    staleTime: STALE,
  })
}

// ── Per-app breakdown for a specific team member ──────────────────
export function useTeamMemberAppBreakdown(memberId: string | null, window: TimeWindow) {
  const { start, end } = getWindowBounds(window)
  return useQuery({
    queryKey: ['app-breakdown-member', memberId, start.toISOString(), end.toISOString()],
    enabled: !!memberId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_events')
        .select('app_name, bundle_id, tab_url, category, duration_seconds')
        .eq('user_id', memberId!)
        .neq('category', 'idle')
        .gte('started_at', start.toISOString())
        .lte('started_at', end.toISOString())
        .not('duration_seconds', 'is', null)
      if (error) throw error
      return (data ?? []) as Pick<DBActivityEvent, 'app_name' | 'bundle_id' | 'tab_url' | 'category' | 'duration_seconds'>[]
    },
    staleTime: STALE,
  })
}

// ── Team members (admin only) ─────────────────────────────────────
export function useTeamMembers(teamOrgId: string | null) {
  return useQuery({
    queryKey: ['team-members', teamOrgId],
    enabled: !!teamOrgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, display_name, avatar_color, role')
        .eq('team_org_id', teamOrgId!)
        .order('display_name')
      if (error) throw error
      return (data ?? []) as Pick<DBUser, 'id' | 'display_name' | 'avatar_color' | 'role'>[]
    },
    staleTime: STALE,
  })
}

// ── Team activity summary ─────────────────────────────────────────
export function useTeamActivitySummary(teamOrgId: string | null, window: TimeWindow) {
  const { start, end } = getWindowBounds(window)
  return useQuery({
    queryKey: ['team-activity', teamOrgId, start.toISOString(), end.toISOString()],
    enabled: !!teamOrgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_events')
        .select('user_id, category, duration_seconds')
        .eq('team_org_id', teamOrgId!)
        .gte('started_at', start.toISOString())
        .lte('started_at', end.toISOString())
        .not('duration_seconds', 'is', null)
      if (error) throw error
      return (data ?? []) as Pick<DBActivityEvent, 'user_id' | 'category' | 'duration_seconds'>[]
    },
    staleTime: STALE,
  })
}

// ── Team sessions summary ─────────────────────────────────────────
export function useTeamSessionsSummary(teamOrgId: string | null, window: TimeWindow) {
  const { start, end } = getWindowBounds(window)
  return useQuery({
    queryKey: ['team-sessions', teamOrgId, start.toISOString(), end.toISOString()],
    enabled: !!teamOrgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('focus_sessions')
        .select('user_id, focus_score, started_at, ended_at, total_pause_seconds')
        .eq('team_org_id', teamOrgId!)
        .eq('status', 'ended')
        .gte('started_at', start.toISOString())
        .lte('started_at', end.toISOString())
      if (error) throw error
      return (data ?? []) as Pick<DBFocusSession, 'user_id' | 'focus_score' | 'started_at' | 'ended_at' | 'total_pause_seconds'>[]
    },
    staleTime: STALE,
  })
}

// ── Team commitments summary ──────────────────────────────────────
export function useTeamCommitmentsSummary(teamOrgId: string | null, window: TimeWindow) {
  const { start, end } = getWindowBounds(window)
  const startDate = start.toISOString().slice(0, 10)
  const endDate = end.toISOString().slice(0, 10)
  return useQuery({
    queryKey: ['team-commitments', teamOrgId, startDate, endDate],
    enabled: !!teamOrgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commitments')
        .select('user_id, status')
        .eq('team_org_id', teamOrgId!)
        .gte('date', startDate)
        .lte('date', endDate)
        .is('deleted_at', null)
      if (error) throw error
      return (data ?? []) as Pick<DBCommitment, 'user_id' | 'status'>[]
    },
    staleTime: STALE,
  })
}

// ── Saved digests ─────────────────────────────────────────────────
export function useLatestDigest(teamOrgId: string | null) {
  return useQuery({
    queryKey: ['latest-digest', teamOrgId],
    enabled: !!teamOrgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_digests')
        .select('*')
        .eq('team_org_id', teamOrgId!)
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as { id: string; team_org_id: string; week_start: string; content: string; created_at: string } | null
    },
    staleTime: STALE,
  })
}
