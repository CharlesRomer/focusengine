import { useState } from 'react'
import { format, parseISO, differenceInSeconds } from 'date-fns'
import { ReportCard } from './ReportCard'
import { formatDuration, formatScore, scoreColor } from '@/lib/reports'
import { useSessionsInWindow, useClassificationsInWindow } from '@/hooks/useReports'
import { SessionDetailPanel } from '@/components/shared/SessionDetailPanel'
import { useAuthStore } from '@/store/auth'
import type { TimeWindow } from '@/lib/reports'
import type { DBFocusSession } from '@/lib/supabase'

interface Props {
  userId: string
  window: TimeWindow
}

export function SessionsCard({ userId, window }: Props) {
  const { data, isLoading } = useSessionsInWindow(userId, window)
  const { data: classifs = [] } = useClassificationsInWindow(userId, window)
  const user = useAuthStore(s => s.user)
  const [selectedSession, setSelectedSession] = useState<DBFocusSession | null>(null)

  const empty = !isLoading && (!data || data.length === 0)

  // Build per-session classification summary
  const classifBySession = new Map<string, { focused: number; distraction: number; total: number }>()
  for (const c of classifs) {
    const existing = classifBySession.get(c.session_id) ?? { focused: 0, distraction: 0, total: 0 }
    existing.total++
    if (c.classification === 'focused') existing.focused++
    else existing.distraction++
    classifBySession.set(c.session_id, existing)
  }

  function netDuration(s: DBFocusSession): number {
    if (!s.ended_at) return 0
    const total = differenceInSeconds(parseISO(s.ended_at), parseISO(s.started_at))
    return Math.max(0, total - (s.total_pause_seconds ?? 0))
  }

  return (
    <>
      <ReportCard
        title="Focus sessions"
        loading={isLoading}
        empty={empty}
        emptyMessage="No sessions ended in this period"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {(data ?? []).map((s) => {
            const dur   = netDuration(s)
            const csums = classifBySession.get(s.id)
            return (
              <button
                key={s.id}
                onClick={() => setSelectedSession(s)}
                style={{
                  width: '100%', background: 'transparent',
                  border: 'none', borderRadius: 'var(--radius-sm)',
                  padding: '8px 10px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  transition: 'background 120ms',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', minWidth: 44, flexShrink: 0 }}>
                  {format(parseISO(s.started_at), 'M/d')}
                </span>
                <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.name}
                </span>
                {/* Classification pill */}
                {csums && (
                  <span style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 4,
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-tertiary)',
                    flexShrink: 0, whiteSpace: 'nowrap',
                  }}>
                    {csums.focused}/{csums.total} focused
                  </span>
                )}
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', minWidth: 36, textAlign: 'right', flexShrink: 0 }}>
                  {formatDuration(dur)}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: scoreColor(s.focus_score), minWidth: 28, textAlign: 'right', flexShrink: 0 }}>
                  {formatScore(s.focus_score)}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>›</span>
              </button>
            )
          })}
        </div>
      </ReportCard>

      {selectedSession && user && (
        <SessionDetailPanel
          session={selectedSession}
          userId={user.id}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </>
  )
}
