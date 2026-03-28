import { useState } from 'react'
import { differenceInSeconds, parseISO } from 'date-fns'
import {
  useTeamMembers,
  useTeamActivitySummary,
  useTeamSessionsSummary,
  useTeamCommitmentsSummary,
  useLatestDigest,
  useTeamMemberAppBreakdown,
} from '@/hooks/useReports'
import {
  formatDuration,
  formatScore,
  scoreColor,
  executionRate,
  extractDomain,
  getWindowBounds,
  CATEGORY_COLORS,
  type TimeWindow,
} from '@/lib/reports'
import type { DBUser, ActivityCategory } from '@/lib/supabase'

interface Props {
  user: DBUser
  window: TimeWindow
}

type SortKey = 'name' | 'score' | 'sessions' | 'deepWork' | 'execution'
type SortDir = 'asc' | 'desc'

interface MemberRow {
  id: string
  name: string
  avatarColor: string | null
  score: number | null
  sessions: number
  deepWorkSeconds: number
  idleSeconds: number
  totalSeconds: number
  done: number
  total: number
}

export function TeamTab({ user, window }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expandedMember, setExpandedMember] = useState<string | null>(null)
  const [insights, setInsights] = useState<string>('')
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [digestLoading, setDigestLoading] = useState(false)
  const [digestContent, setDigestContent] = useState<string>('')

  const { data: members, isLoading: membersLoading } = useTeamMembers(user.team_org_id)
  const { data: activity, isLoading: actLoading } = useTeamActivitySummary(user.team_org_id, window)
  const { data: sessions, isLoading: sessLoading } = useTeamSessionsSummary(user.team_org_id, window)
  const { data: commitments, isLoading: commLoading } = useTeamCommitmentsSummary(user.team_org_id, window)
  const { data: latestDigest } = useLatestDigest(user.team_org_id)

  const loading = membersLoading || actLoading || sessLoading || commLoading

  const rows: MemberRow[] = (members ?? []).map((m) => {
    const memberActivity = (activity ?? []).filter((a) => a.user_id === m.id)
    const totalSec = memberActivity.reduce((s, a) => s + (a.duration_seconds ?? 0), 0)
    const deepSec = memberActivity
      .filter((a) => a.category === 'deep_work')
      .reduce((s, a) => s + (a.duration_seconds ?? 0), 0)
    const idleSec = memberActivity
      .filter((a) => a.category === 'idle')
      .reduce((s, a) => s + (a.duration_seconds ?? 0), 0)

    const memberSessions = (sessions ?? []).filter((s) => s.user_id === m.id)
    const scores = memberSessions
      .map((s) => s.focus_score)
      .filter((sc): sc is number => sc !== null)
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null

    const memberComms = (commitments ?? []).filter((c) => c.user_id === m.id)
    const done = memberComms.filter((c) => c.status === 'done').length

    return {
      id: m.id,
      name: m.display_name,
      avatarColor: m.avatar_color,
      score: avgScore,
      sessions: memberSessions.length,
      deepWorkSeconds: deepSec,
      idleSeconds: idleSec,
      totalSeconds: totalSec,
      done,
      total: memberComms.length,
    }
  })

  function sortValue(row: MemberRow): number | string {
    switch (sortKey) {
      case 'name': return row.name
      case 'score': return row.score ?? -1
      case 'sessions': return row.sessions
      case 'deepWork': return row.deepWorkSeconds
      case 'execution': return executionRate(row.done, row.total)
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = sortValue(a)
    const bv = sortValue(b)
    const cmp = typeof av === 'string'
      ? av.localeCompare(bv as string)
      : (av as number) - (bv as number)
    return sortDir === 'desc' ? -cmp : cmp
  })

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  async function generateInsights() {
    setInsightsLoading(true)
    setInsights('')
    try {
      const { start, end } = getWindowBounds(window)
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-insights`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            teamOrgId: user.team_org_id,
            windowStart: start.toISOString(),
            windowEnd: end.toISOString(),
            rows: sorted.map((r) => ({
              name: r.name,
              score: r.score,
              sessions: r.sessions,
              deepWorkHours: (r.deepWorkSeconds / 3600).toFixed(1),
              executionRate: executionRate(r.done, r.total),
            })),
          }),
        }
      )
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      setInsights(json.insights ?? '')
    } catch (err) {
      setInsights(`Error generating insights: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setInsightsLoading(false)
    }
  }

  async function generateDigest() {
    setDigestLoading(true)
    setDigestContent('')
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-digest`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ teamOrgId: user.team_org_id }),
        }
      )
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      setDigestContent(json.content ?? '')
    } catch (err) {
      setDigestContent(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setDigestLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ height: 44, borderRadius: 6 }} />
        ))}
      </div>
    )
  }

  const th: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-tertiary)',
    fontWeight: 400,
    textAlign: 'left',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border-subtle)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Sortable table */}
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {(
                [
                  ['name', 'Member'],
                  ['score', 'Avg score'],
                  ['sessions', 'Sessions'],
                  ['deepWork', 'Deep work'],
                  ['execution', 'Execution'],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th
                  key={key}
                  style={{ ...th, color: sortKey === key ? 'var(--text-secondary)' : undefined }}
                  onClick={() => handleSort(key)}
                >
                  {label}
                  {sortKey === key && (
                    <span style={{ marginLeft: 4 }}>{sortDir === 'desc' ? '↓' : '↑'}</span>
                  )}
                </th>
              ))}
              <th style={th}>Idle %</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <>
                <tr
                  key={row.id}
                  onClick={() => setExpandedMember(expandedMember === row.id ? null : row.id)}
                  style={{
                    borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    background: expandedMember === row.id ? 'var(--bg-hover)' : 'transparent',
                  }}
                >
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: row.avatarColor ?? 'var(--accent)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10,
                          color: '#fff',
                          fontWeight: 500,
                          flexShrink: 0,
                        }}
                      >
                        {row.name.slice(0, 1).toUpperCase()}
                      </div>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                        {row.name}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 2 }}>
                        {expandedMember === row.id ? '▴' : '▾'}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: scoreColor(row.score) }}>
                      {formatScore(row.score)}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                    {row.sessions}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                    {formatDuration(row.deepWorkSeconds)}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        fontSize: 'var(--text-sm)',
                        color: (() => {
                          const r = executionRate(row.done, row.total)
                          return r >= 80 ? 'var(--success)' : r >= 50 ? 'var(--warning)' : 'var(--danger)'
                        })(),
                      }}
                    >
                      {row.total === 0 ? '—' : `${executionRate(row.done, row.total)}%`}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {row.totalSeconds > 0 ? (() => {
                      const idlePct = Math.round((row.idleSeconds / row.totalSeconds) * 100)
                      return (
                        <span style={{
                          fontSize: 'var(--text-sm)',
                          color: idlePct > 30 ? 'var(--warning)' : 'var(--text-secondary)',
                        }}>
                          {idlePct}%
                        </span>
                      )
                    })() : <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>—</span>}
                  </td>
                </tr>
                {expandedMember === row.id && (
                  <tr key={`${row.id}-expand`} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td colSpan={6} style={{ padding: '12px 16px 16px', background: 'var(--bg-surface)' }}>
                      <MemberAppBreakdown memberId={row.id} window={window} />
                    </td>
                  </tr>
                )}
              </>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: '32px 12px',
                    textAlign: 'center',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  No team data for this period
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* AI Insights */}
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-4)',
          }}
        >
          <div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>AI insights</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>
              Pattern analysis for this period
            </div>
          </div>
          <button
            onClick={generateInsights}
            disabled={insightsLoading}
            style={{
              padding: '6px 14px',
              fontSize: 'var(--text-xs)',
              background: 'var(--accent-subtle)',
              color: 'var(--accent)',
              border: '1px solid rgba(124,111,224,0.3)',
              borderRadius: 'var(--radius-sm)',
              cursor: insightsLoading ? 'not-allowed' : 'pointer',
              opacity: insightsLoading ? 0.6 : 1,
            }}
          >
            {insightsLoading ? 'Generating…' : 'Generate'}
          </button>
        </div>

        {insights ? (
          <div
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}
          >
            {insights}
          </div>
        ) : (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
            Click generate to analyze team patterns with AI
          </div>
        )}
      </div>

      {/* Friday Digest */}
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-4)',
          }}
        >
          <div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Friday digest</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>
              {latestDigest
                ? `Last generated: week of ${latestDigest.week_start}`
                : 'Weekly team summary'}
            </div>
          </div>
          <button
            onClick={generateDigest}
            disabled={digestLoading}
            style={{
              padding: '6px 14px',
              fontSize: 'var(--text-xs)',
              background: 'var(--accent-subtle)',
              color: 'var(--accent)',
              border: '1px solid rgba(124,111,224,0.3)',
              borderRadius: 'var(--radius-sm)',
              cursor: digestLoading ? 'not-allowed' : 'pointer',
              opacity: digestLoading ? 0.6 : 1,
            }}
          >
            {digestLoading ? 'Generating…' : 'Generate now'}
          </button>
        </div>

        {digestContent ? (
          <div
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}
          >
            {digestContent}
          </div>
        ) : latestDigest ? (
          <div
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}
          >
            {latestDigest.content}
          </div>
        ) : (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
            No digest generated yet
          </div>
        )}
      </div>
    </div>
  )
}

// ── Per-member app breakdown (inline in expanded row) ─────────────

function MemberAppBreakdown({ memberId, window }: { memberId: string; window: TimeWindow }) {
  const { data, isLoading } = useTeamMemberAppBreakdown(memberId, window)

  if (isLoading) {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 12, flex: 1, borderRadius: 4 }} />
        ))}
      </div>
    )
  }

  // Aggregate by app/domain
  const byApp = new Map<string, { seconds: number; category: ActivityCategory }>()
  for (const ev of data ?? []) {
    const s = ev.duration_seconds ?? 0
    if (s <= 0) continue
    const key = ev.tab_url ? extractDomain(ev.tab_url) : (ev.app_name ?? 'Unknown')
    const existing = byApp.get(key)
    if (existing) {
      existing.seconds += s
    } else {
      byApp.set(key, { seconds: s, category: ev.category as ActivityCategory })
    }
  }

  const sorted = Array.from(byApp.entries())
    .sort((a, b) => b[1].seconds - a[1].seconds)
    .slice(0, 10)

  const maxSec = sorted[0]?.[1]?.seconds ?? 0

  if (sorted.length === 0) {
    return (
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
        No activity data for this period
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 2 }}>
        App breakdown
      </div>
      {sorted.map(([label, { seconds, category }]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: 2,
              background: CATEGORY_COLORS[category],
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              width: 140,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {label}
          </span>
          <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--bg-active)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${maxSec > 0 ? (seconds / maxSec) * 100 : 0}%`,
                background: CATEGORY_COLORS[category],
                borderRadius: 2,
                opacity: 0.7,
              }}
            />
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', flexShrink: 0, minWidth: 36, textAlign: 'right' }}>
            {formatDuration(seconds)}
          </span>
        </div>
      ))}
    </div>
  )
}
