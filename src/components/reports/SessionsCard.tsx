import { useState } from 'react'
import { format, parseISO, differenceInSeconds } from 'date-fns'
import { ReportCard } from './ReportCard'
import { formatDuration, formatScore, scoreColor } from '@/lib/reports'
import { useSessionsInWindow } from '@/hooks/useReports'
import type { TimeWindow } from '@/lib/reports'
import type { DBFocusSession } from '@/lib/supabase'

interface Props {
  userId: string
  window: TimeWindow
}

export function SessionsCard({ userId, window }: Props) {
  const { data, isLoading } = useSessionsInWindow(userId, window)
  const [expanded, setExpanded] = useState<string | null>(null)

  const empty = !isLoading && (!data || data.length === 0)

  function netDuration(s: DBFocusSession): number {
    if (!s.ended_at) return 0
    const total = differenceInSeconds(parseISO(s.ended_at), parseISO(s.started_at))
    return Math.max(0, total - (s.total_pause_seconds ?? 0))
  }

  return (
    <ReportCard
      title="Focus sessions"
      loading={isLoading}
      empty={empty}
      emptyMessage="No sessions ended in this period"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {(data ?? []).map((s) => {
          const isOpen = expanded === s.id
          const dur = netDuration(s)
          return (
            <div key={s.id}>
              <button
                onClick={() => setExpanded(isOpen ? null : s.id)}
                style={{
                  width: '100%',
                  background: isOpen ? 'var(--bg-hover)' : 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-tertiary)',
                    minWidth: 44,
                    flexShrink: 0,
                  }}
                >
                  {format(parseISO(s.started_at), 'M/d')}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.name}
                </span>
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-secondary)',
                    minWidth: 36,
                    textAlign: 'right',
                    flexShrink: 0,
                  }}
                >
                  {formatDuration(dur)}
                </span>
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 500,
                    color: scoreColor(s.focus_score),
                    minWidth: 28,
                    textAlign: 'right',
                    flexShrink: 0,
                  }}
                >
                  {formatScore(s.focus_score)}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--text-tertiary)',
                    marginLeft: 2,
                    transition: 'transform 150ms',
                    transform: isOpen ? 'rotate(180deg)' : 'none',
                  }}
                >
                  ▾
                </span>
              </button>

              {isOpen && (
                <div
                  style={{
                    padding: '8px 10px 10px 54px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                    {format(parseISO(s.started_at), 'h:mm a')}
                    {s.ended_at ? ` → ${format(parseISO(s.ended_at), 'h:mm a')}` : ''}
                    {s.total_pause_seconds
                      ? ` · ${formatDuration(s.total_pause_seconds)} paused`
                      : ''}
                  </div>
                  {s.output_note && (
                    <div
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-secondary)',
                        marginTop: 2,
                        lineHeight: 1.5,
                      }}
                    >
                      {s.output_note}
                    </div>
                  )}
                  {!s.output_note && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                      No output note
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </ReportCard>
  )
}
