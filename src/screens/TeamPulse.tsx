import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { StatusStrip } from '@/components/teamPulse/StatusStrip'
import { TodaysCommitments } from '@/components/teamPulse/TodaysCommitments'
import { WeeklyExecution } from '@/components/teamPulse/WeeklyExecution'
import {
  useTeamMembers,
  useTeamActiveSessions,
  useTeamLastActivity,
  useTeamTodayCommitments,
  useWeeklyCommitments,
  useWeeklySessionStats,
  useWeeklyDeepWork,
} from '@/hooks/useTeamPulse'

export function TeamPulseScreen() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const teamOrgId = user?.team_org_id ?? ''

  // ── Data queries ────────────────────────────────────────────────
  const { data: members, isLoading: membersLoading } = useTeamMembers(teamOrgId)
  const { data: sessions, isLoading: sessionsLoading } = useTeamActiveSessions(teamOrgId)
  const { data: lastActivity, isLoading: activityLoading } = useTeamLastActivity(teamOrgId)
  const { data: todayCommitments, isLoading: commitmentsLoading } = useTeamTodayCommitments(teamOrgId)
  const { data: weeklyCommitments, isLoading: weeklyCommLoading } = useWeeklyCommitments(teamOrgId)
  const { data: weeklySessions, isLoading: weeklySessionsLoading } = useWeeklySessionStats(teamOrgId)
  const { data: weeklyDeepWork, isLoading: weeklyDeepLoading } = useWeeklyDeepWork(teamOrgId)

  const stripLoading = membersLoading || sessionsLoading || activityLoading
  const commLoading = membersLoading || commitmentsLoading
  const weeklyLoading = membersLoading || weeklyCommLoading || weeklySessionsLoading || weeklyDeepLoading

  // ── Realtime subscriptions ──────────────────────────────────────
  useEffect(() => {
    if (!teamOrgId) return

    const channel = supabase
      .channel(`team-pulse-${teamOrgId}`)
      // focus_sessions: session start/pause/end
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'focus_sessions', filter: `team_org_id=eq.${teamOrgId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['team-members', teamOrgId] })
          qc.invalidateQueries({ queryKey: ['team-active-sessions', teamOrgId] })
          qc.invalidateQueries({ queryKey: ['team-weekly-sessions', teamOrgId] })
        }
      )
      // commitments: new, updated, deleted
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'commitments', filter: `team_org_id=eq.${teamOrgId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['team-today-commitments', teamOrgId] })
          qc.invalidateQueries({ queryKey: ['team-weekly-commitments', teamOrgId] })
          qc.invalidateQueries({ queryKey: ['commitments'] }) // keep personal query fresh too
        }
      )
      // activity_events: new events (INSERT only to avoid spam)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_events', filter: `team_org_id=eq.${teamOrgId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['team-last-activity', teamOrgId] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [teamOrgId, qc])

  if (!user) return null

  // No team
  if (!teamOrgId) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 12,
          color: 'var(--text-tertiary)',
        }}
      >
        <p style={{ fontSize: 'var(--text-sm)' }}>You're not in a team yet.</p>
      </div>
    )
  }

  const memberList = members ?? []
  const sessionList = sessions ?? []
  const activityMap = lastActivity ?? new Map()

  // Single-member banner
  const isSolo = !membersLoading && memberList.length <= 1

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 'var(--space-8)',
        maxWidth: 1400,
        margin: '0 auto',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 40,
      }}
    >
      {/* ── Section 1: Live status strip ─────────────────────────── */}
      <section>
        <StatusStrip
          members={memberList}
          sessions={sessionList}
          lastActivity={activityMap}
          loading={stripLoading}
          currentUserId={user.id}
        />

        {/* Solo banner */}
        {isSolo && (
          <div
            style={{
              marginTop: 16,
              padding: '14px 20px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)' }}>
                Your team is just you right now
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 3 }}>
                Share your team code from Settings to invite teammates
              </div>
            </div>
            <button
              onClick={() => navigate('/settings')}
              style={{
                padding: '6px 14px',
                fontSize: 'var(--text-xs)',
                background: 'none',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Go to Settings →
            </button>
          </div>
        )}
      </section>

      {/* ── Section 2: Today's commitments ───────────────────────── */}
      <section
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6)',
        }}
      >
        <TodaysCommitments
          members={memberList}
          commitments={todayCommitments ?? []}
          currentUserId={user.id}
          loading={commLoading}
        />

        {/* Whole-team empty state */}
        {!commLoading && (todayCommitments ?? []).filter((c) => !c.deleted_at).length === 0 && memberList.length > 0 && (
          <div
            style={{
              marginTop: 16,
              textAlign: 'center',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-tertiary)',
            }}
          >
            No commitments set today
            <div style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>
              Each team member sets 1–3 commitments each morning
            </div>
          </div>
        )}
      </section>

      {/* ── Section 3: Weekly execution ──────────────────────────── */}
      <section
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6)',
        }}
      >
        <WeeklyExecution
          members={memberList}
          weeklyCommitments={weeklyCommitments}
          weeklySessions={weeklySessions}
          weeklyDeepWork={weeklyDeepWork}
          loading={weeklyLoading}
        />
      </section>
    </div>
  )
}
