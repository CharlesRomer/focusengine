import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { format, startOfWeek, endOfWeek, eachDayOfInterval, parseISO } from 'date-fns'
import { avatarColor } from './MemberCard'
import type { TeamMember, WeeklyCommitmentStats, WeeklySessionStats } from '@/hooks/useTeamPulse'

function rateColor(rate: number | null): string {
  if (rate === null) return 'var(--text-tertiary)'
  if (rate >= 70) return 'var(--success)'
  if (rate >= 50) return 'var(--warning)'
  return 'var(--danger)'
}

function formatScore(score: number | null): string {
  if (score === null) return '—'
  return String(Math.round(score))
}

function scoreColor(score: number | null): string {
  if (score === null) return 'var(--text-tertiary)'
  if (score >= 75) return 'var(--success)'
  if (score >= 50) return 'var(--warning)'
  return 'var(--danger)'
}

interface Props {
  members: TeamMember[]
  weeklyCommitments: WeeklyCommitmentStats | undefined
  weeklySessions: Map<string, WeeklySessionStats> | undefined
  weeklyDeepWork: Map<string, number> | undefined
  loading: boolean
}

export function WeeklyExecution({
  members,
  weeklyCommitments,
  weeklySessions,
  weeklyDeepWork,
  loading,
}: Props) {
  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
  const weekLabel = `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d')}`

  // Team execution rate
  let totalSet = 0
  let totalDone = 0
  if (weeklyCommitments) {
    for (const [, v] of weeklyCommitments.byUser.entries()) {
      totalSet += v.totalSet
      totalDone += v.totalDone
    }
  }
  const teamRate = totalSet === 0 ? null : Math.round((totalDone / totalSet) * 100)

  // Build 7-day sparkline (all days Mon–Sun, fill missing with 0)
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })
  const sparkData = weekDays.map((d) => {
    const dateStr = format(d, 'yyyy-MM-dd')
    const entry = weeklyCommitments?.byDate.find((b) => b.date === dateStr)
    const rate = entry && entry.totalSet > 0
      ? Math.round((entry.totalDone / entry.totalSet) * 100)
      : null
    return { date: dateStr, rate }
  })

  const lineColor = rateColor(teamRate)

  return (
    <div>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)' }}>This week</span>
        <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{weekLabel}</span>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 120, borderRadius: 8 }} />
      ) : (
        <>
          {/* Team rate + sparkline */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
            <div
              style={{
                fontSize: 48,
                fontWeight: 600,
                color: rateColor(teamRate),
                lineHeight: 1,
              }}
            >
              {teamRate === null ? '—' : `${teamRate}%`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 6 }}>
              team execution rate
            </div>
            <div style={{ marginTop: 12 }}>
              <ResponsiveContainer width={200} height={40}>
                <LineChart data={sparkData}>
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke={lineColor}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Per-member table */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {(['Member', 'Sessions', 'Focus hrs', 'Exec rate', 'Score'] as const).map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '6px 12px',
                      fontSize: 11,
                      fontWeight: 500,
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      textAlign: h === 'Member' ? 'left' : 'right',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((member, i) => {
                const commStats = weeklyCommitments?.byUser.get(member.id)
                const sessionStats = weeklySessions?.get(member.id)
                const deepSec = weeklyDeepWork?.get(member.id) ?? 0
                const deepHrs = (deepSec / 3600).toFixed(1)
                const execRate =
                  commStats && commStats.totalSet > 0
                    ? Math.round((commStats.totalDone / commStats.totalSet) * 100)
                    : null

                return (
                  <tr
                    key={member.id}
                    style={{
                      height: 44,
                      borderBottom: i < members.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      transition: 'background 150ms',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Member */}
                    <td style={{ padding: '0 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            background: avatarColor(member.id),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 9,
                            fontWeight: 500,
                            color: '#fff',
                            flexShrink: 0,
                          }}
                        >
                          {member.display_name.slice(0, 1).toUpperCase()}
                        </div>
                        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                          {member.display_name}
                        </span>
                      </div>
                    </td>

                    {/* Sessions */}
                    <td style={{ padding: '0 12px', textAlign: 'right', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {sessionStats?.sessionCount ?? '—'}
                    </td>

                    {/* Focus hrs */}
                    <td style={{ padding: '0 12px', textAlign: 'right', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {deepSec > 0 ? `${deepHrs}h` : '—'}
                    </td>

                    {/* Exec rate */}
                    <td style={{ padding: '0 12px', textAlign: 'right' }}>
                      {execRate === null ? (
                        <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>—</span>
                      ) : (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 500,
                            padding: '2px 8px',
                            borderRadius: 10,
                            background: 'var(--bg-elevated)',
                            color: rateColor(execRate),
                          }}
                        >
                          {execRate}%
                        </span>
                      )}
                    </td>

                    {/* Score */}
                    <td style={{ padding: '0 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                        {sessionStats?.avgScore !== undefined && (
                          <div
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: scoreColor(sessionStats.avgScore),
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <span style={{ fontSize: 13, color: scoreColor(sessionStats?.avgScore ?? null) }}>
                          {formatScore(sessionStats?.avgScore ?? null)}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
