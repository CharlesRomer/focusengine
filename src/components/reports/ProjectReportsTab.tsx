import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import { format, parseISO, isValid } from 'date-fns'
import { useProjectReports, type MemberMetrics } from '@/hooks/useProjectReports'
import { avatarHsl, getInitials } from '@/lib/avatar'

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ height = 120, width = '100%' }: { height?: number; width?: number | string }) {
  return (
    <div
      className="skeleton"
      style={{ height, width, borderRadius: 6 }}
    />
  )
}

function CardSkeleton() {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-6)',
      }}
    >
      <Skeleton height={14} width="35%" />
      <div style={{ marginTop: 16 }}>
        <Skeleton height={120} />
      </div>
      <div style={{ marginTop: 8 }}>
        <Skeleton height={14} width="60%" />
      </div>
    </div>
  )
}

// ── Small avatar ──────────────────────────────────────────────────────────────

function Avatar({ name, avatarColor, size = 24 }: { name: string; avatarColor: string | null; size?: number }) {
  const bg = avatarColor ?? avatarHsl(name)
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        fontWeight: 500,
        color: '#fff',
        flexShrink: 0,
      }}
    >
      {getInitials(name)}
    </div>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function InlineProgress({ pct, color = 'var(--accent)', width = 60, height = 6 }: { pct: number; color?: string; width?: number; height?: number }) {
  return (
    <div style={{ width, height, background: 'var(--bg-hover)', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 3 }} />
    </div>
  )
}

// ── Velocity badge ────────────────────────────────────────────────────────────

function VelocityBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warning)' : 'var(--danger)'
  const bg = score >= 70 ? 'rgba(61,184,122,0.12)' : score >= 40 ? 'rgba(224,160,82,0.12)' : 'rgba(217,92,92,0.12)'
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: bg, color, fontSize: 'var(--text-xs)', fontWeight: 500 }}>
      {score.toFixed(0)}
    </span>
  )
}

// ── Recharts custom tooltip ───────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '8px 12px', fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
      {label && <div style={{ color: 'var(--text-tertiary)', marginBottom: 4 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i}>{p.name ? `${p.name}: ` : ''}{p.value}</div>
      ))}
    </div>
  )
}

// ── Card 1: Project Health Overview ──────────────────────────────────────────

function ProjectHealthCard() {
  const { data, isLoading } = useProjectReports()

  if (isLoading) return <CardSkeleton />

  if (!data || data.projectMetrics.length === 0) {
    return (
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)' }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)', marginBottom: 'var(--space-4)' }}>Project Health</div>
        <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: '32px 0' }}>
          No projects yet. <Link to="/board" style={{ color: 'var(--accent)' }}>Create one on the Board.</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)' }}>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)', marginBottom: 'var(--space-4)' }}>Project Health</div>
      <div style={{ display: 'flex', gap: 'var(--space-4)', overflowX: 'auto', paddingBottom: 4 }}>
        {data.projectMetrics.map(pm => (
          <div
            key={pm.project.id}
            style={{
              minWidth: 200,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4)',
              flexShrink: 0,
            }}
          >
            {/* Project name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: pm.project.color, flexShrink: 0 }} />
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {pm.project.name}
              </span>
            </div>

            {/* Progress bar */}
            <div style={{ marginBottom: 6 }}>
              <div style={{ height: 6, background: 'var(--bg-hover)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${pm.completionRate}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
              </div>
            </div>

            {/* Task count */}
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 8 }}>
              {pm.completedTasks} / {pm.totalTasks} tasks complete
            </div>

            {/* Badges */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {pm.isOverdue && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)', background: 'rgba(217,92,92,0.1)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>
                  overdue
                </span>
              )}
              {pm.openBlockers > 0 && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', background: 'rgba(224,160,82,0.1)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>
                  {pm.openBlockers} blocker{pm.openBlockers !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Days open */}
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 8 }}>
              {pm.daysOpen} days open
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Card 2: Team Member Performance Table ────────────────────────────────────

type MemberSortKey = 'name' | 'assigned' | 'completed' | 'completionRate' | 'avgDays' | 'velocity'

function MemberPerformanceCard() {
  const { data, isLoading } = useProjectReports()
  const [sortKey, setSortKey] = useState<MemberSortKey>('velocity')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    if (!data) return []
    return [...data.memberMetrics].sort((a, b) => {
      let av: number | string, bv: number | string
      switch (sortKey) {
        case 'name': av = a.member.display_name; bv = b.member.display_name; break
        case 'assigned': av = a.totalAssigned; bv = b.totalAssigned; break
        case 'completed': av = a.totalCompleted; bv = b.totalCompleted; break
        case 'completionRate': av = a.completionRate; bv = b.completionRate; break
        case 'avgDays': av = a.avgCompletionDays ?? 999; bv = b.avgCompletionDays ?? 999; break
        case 'velocity': av = a.velocityScore; bv = b.velocityScore; break
        default: av = a.velocityScore; bv = b.velocityScore
      }
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [data, sortKey, sortDir])

  function toggleSort(key: MemberSortKey) {
    if (sortKey === key) setsSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function setsSortDir(fn: (d: 'asc' | 'desc') => 'asc' | 'desc') {
    setSortDir(fn(sortDir))
  }

  if (isLoading) return <CardSkeleton />

  if (!data || data.memberMetrics.length === 0) {
    return (
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)' }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)', marginBottom: 'var(--space-4)' }}>Team Performance</div>
        <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: '24px 0' }}>No assigned tasks yet.</div>
      </div>
    )
  }

  const colStyle = (key: MemberSortKey): React.CSSProperties => ({
    fontSize: 'var(--text-xs)',
    color: sortKey === key ? 'var(--text-primary)' : 'var(--text-secondary)',
    fontWeight: 500,
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    padding: '0 8px 8px 0',
  })

  const cellStyle: React.CSSProperties = {
    padding: '10px 8px 10px 0',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    borderTop: '1px solid var(--border-subtle)',
    verticalAlign: 'middle',
  }

  function SortIndicator({ col }: { col: MemberSortKey }) {
    if (sortKey !== col) return <span style={{ color: 'var(--text-tertiary)', marginLeft: 3 }}>↕</span>
    return <span style={{ marginLeft: 3 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)' }}>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)', marginBottom: 'var(--space-4)' }}>Team Performance</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={colStyle('name')} onClick={() => toggleSort('name')}>Member <SortIndicator col="name" /></th>
              <th style={colStyle('assigned')} onClick={() => toggleSort('assigned')}>Assigned <SortIndicator col="assigned" /></th>
              <th style={colStyle('completed')} onClick={() => toggleSort('completed')}>Completed <SortIndicator col="completed" /></th>
              <th style={colStyle('completionRate')} onClick={() => toggleSort('completionRate')}>Rate <SortIndicator col="completionRate" /></th>
              <th style={colStyle('avgDays')} onClick={() => toggleSort('avgDays')}>Avg days <SortIndicator col="avgDays" /></th>
              <th style={{ ...colStyle('velocity'), textAlign: 'right' }} onClick={() => toggleSort('velocity')}>Velocity <SortIndicator col="velocity" /></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m: MemberMetrics) => (
              <tr key={m.member.id}>
                <td style={cellStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar name={m.member.display_name} avatarColor={m.member.avatar_color} size={24} />
                    <span style={{ whiteSpace: 'nowrap' }}>{m.member.display_name}</span>
                  </div>
                </td>
                <td style={cellStyle}>{m.totalAssigned}</td>
                <td style={cellStyle}>{m.totalCompleted}</td>
                <td style={cellStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <InlineProgress pct={m.completionRate} />
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{m.completionRate.toFixed(0)}%</span>
                  </div>
                </td>
                <td style={cellStyle}>
                  {m.avgCompletionDays !== null ? (
                    <span style={{ color: m.avgCompletionDays > 14 ? 'var(--danger)' : m.avgCompletionDays > 7 ? 'var(--warning)' : 'var(--text-primary)' }}>
                      {m.avgCompletionDays.toFixed(1)} days
                    </span>
                  ) : '—'}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>
                  <VelocityBadge score={m.velocityScore} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12, fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
        Velocity score combines completion rate and average task speed, normalized across the team. Higher is better.
      </div>
    </div>
  )
}

// ── Card 3: Task Age & Open Work ──────────────────────────────────────────────

function TaskAgeCard() {
  const { data, isLoading } = useProjectReports()

  if (isLoading) return <CardSkeleton />
  if (!data) return null

  const teamAvg = data.memberMetrics.length > 0
    ? data.memberMetrics.reduce((a, b) => a + b.openTasks, 0) / data.memberMetrics.length
    : 0

  const barData = data.memberMetrics.map(m => ({
    name: m.member.display_name.split(' ')[0],
    open: m.openTasks,
    isHigh: m.openTasks > teamAvg * 1.5,
  }))

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)' }}>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)', marginBottom: 'var(--space-4)' }}>Task Age & Open Work</div>

      {/* Two stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 4 }}>Avg open task age</div>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 500, color: 'var(--text-primary)' }}>
            {data.avgTaskAgeDays !== null ? `${data.avgTaskAgeDays.toFixed(0)} days` : '—'}
          </div>
        </div>
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 4 }}>Oldest open task</div>
          {data.oldestOpenTask ? (
            <>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 500, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {data.oldestOpenTask.title}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                {data.oldestOpenTask.ownerName ? `${data.oldestOpenTask.ownerName} · ` : ''}{data.oldestOpenTask.subProjectName}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 4 }}>{data.oldestOpenTask.ageDays} days old</div>
            </>
          ) : (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>—</div>
          )}
        </div>
      </div>

      {/* Open tasks per member bar chart */}
      {barData.length > 0 && (
        <>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 8 }}>Open tasks by member</div>
          <ResponsiveContainer width="100%" height={160} style={{ background: 'transparent' }}>
            <BarChart data={barData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              {teamAvg > 0 && <ReferenceLine y={teamAvg * 1.5} stroke="var(--warning)" strokeDasharray="3 3" />}
              <Bar dataKey="open" name="Open tasks" radius={[3, 3, 0, 0]}
                fill="var(--accent)"
                // color individual bars based on isHigh — using Cell would require import, use single color for simplicity
              />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}

// ── Card 4: Completion Trends ─────────────────────────────────────────────────

function CompletionTrendsCard() {
  const { data, isLoading } = useProjectReports()

  if (isLoading) return <CardSkeleton />
  if (!data) return null

  const thisWeek = data.tasksCompletedThisWeek
  const lastWeek = data.tasksCompletedLastWeek
  const weekChange = lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek) * 100 : null

  const thisMonth = data.subProjectsCompletedThisMonth
  const lastMonth = data.subProjectsCompletedLastMonth
  const monthChange = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null

  const lineData = data.weeklyTaskCompletions.map(b => ({
    week: format(parseISO(b.weekStart), 'MMM d'),
    tasks: b.count,
  }))

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)' }}>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)', marginBottom: 'var(--space-4)' }}>Completion Trends</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 4 }}>Tasks completed this week</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 'var(--text-xl)', fontWeight: 500, color: 'var(--text-primary)' }}>{thisWeek}</span>
            {weekChange !== null && (
              <span style={{ fontSize: 'var(--text-xs)', color: weekChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {weekChange >= 0 ? '↑' : '↓'} {Math.abs(weekChange).toFixed(0)}% vs last week
              </span>
            )}
          </div>
        </div>
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 4 }}>Sub-projects completed this month</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 'var(--text-xl)', fontWeight: 500, color: 'var(--text-primary)' }}>{thisMonth}</span>
            {monthChange !== null && (
              <span style={{ fontSize: 'var(--text-xs)', color: monthChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {monthChange >= 0 ? '↑' : '↓'} {Math.abs(monthChange).toFixed(0)}% vs last month
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 8 }}>Tasks completed per week (last 8 weeks)</div>
      <ResponsiveContainer width="100%" height={160} style={{ background: 'transparent' }}>
        <LineChart data={lineData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="var(--border-subtle)" />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          <Line type="monotone" dataKey="tasks" name="Tasks" stroke="var(--accent)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Card 5: Blocker Analytics ─────────────────────────────────────────────────

function BlockerAnalyticsCard() {
  const { data, isLoading, rawData } = useProjectReports()

  if (isLoading) return <CardSkeleton />
  if (!data || !rawData) return null

  const allBlockers = rawData.blockers
  const projectById = new Map(rawData.projects.map(p => [p.id, p]))
  const openBlockers = allBlockers.filter(b => !b.is_resolved)

  const longestOpen = [...openBlockers]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(0, 3)
    .map(b => {
      const created = parseISO(b.created_at)
      const days = isValid(created) ? Math.floor((Date.now() - created.getTime()) / 86_400_000) : 0
      return { ...b, days, projectName: projectById.get(b.project_id)?.name ?? '—' }
    })

  const avgResolutionDays = (() => {
    const resolved = allBlockers.filter(b => b.is_resolved && b.resolved_at)
    if (resolved.length === 0) return null
    const total = resolved.reduce((acc, b) => {
      const c = parseISO(b.created_at)
      const r = parseISO(b.resolved_at!)
      return acc + (isValid(c) && isValid(r) ? Math.max(0, (r.getTime() - c.getTime()) / 86_400_000) : 0)
    }, 0)
    return parseFloat((total / resolved.length).toFixed(1))
  })()

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)' }}>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)', marginBottom: 'var(--space-4)' }}>Blocker Analytics</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 4 }}>Total created</div>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 500, color: 'var(--text-primary)' }}>{allBlockers.length}</div>
        </div>
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 4 }}>Currently open</div>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 500, color: openBlockers.length > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
            {openBlockers.length}
          </div>
        </div>
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 4 }}>Avg resolution</div>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 500, color: 'var(--text-primary)' }}>
            {avgResolutionDays !== null ? `${avgResolutionDays} days` : '—'}
          </div>
        </div>
      </div>

      {longestOpen.length > 0 && (
        <>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 8 }}>Longest-running open blockers</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {longestOpen.map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{b.projectName}</div>
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', flexShrink: 0 }}>{b.days} days</div>
              </div>
            ))}
          </div>
        </>
      )}

      {longestOpen.length === 0 && (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: '16px 0' }}>No open blockers.</div>
      )}
    </div>
  )
}

// ── Card 6: Documentation Rate ────────────────────────────────────────────────

function DocumentationRateCard() {
  const { data, isLoading } = useProjectReports()

  if (isLoading) return <CardSkeleton />
  if (!data) return null

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)' }}>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)', marginBottom: 'var(--space-4)' }}>Documentation Rate</div>

      <div style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 6 }}>
          Completed tasks with proof links
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 500, color: 'var(--text-primary)' }}>
            {data.documentationRate !== null ? `${data.documentationRate.toFixed(0)}%` : '—'}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
            {data.tasksWithProofUrl} of {data.totalCompletedTasks} completed tasks
          </div>
        </div>
        {data.documentationRate !== null && (
          <div style={{ marginTop: 8, height: 8, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${data.documentationRate}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
          </div>
        )}
      </div>

      {data.memberDocRates.length > 0 && (
        <>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 8 }}>By team member</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.memberDocRates
              .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))
              .map(m => (
                <div key={m.member.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={m.member.display_name} avatarColor={m.member.avatar_color} size={20} />
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', width: 100, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.member.display_name}
                  </span>
                  <div style={{ flex: 1 }}>
                    <InlineProgress pct={m.rate ?? 0} width={120} />
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', width: 36, textAlign: 'right', flexShrink: 0 }}>
                    {m.rate !== null ? `${m.rate.toFixed(0)}%` : '—'}
                  </span>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Error state ───────────────────────────────────────────────────────────────

function ErrorCard() {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
      Failed to load project data. Please refresh.
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProjectReportsTab() {
  const { isError } = useProjectReports()

  if (isError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <ErrorCard />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <ProjectHealthCard />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
        <TaskAgeCard />
        <CompletionTrendsCard />
      </div>
      <MemberPerformanceCard />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
        <BlockerAnalyticsCard />
        <DocumentationRateCard />
      </div>
    </div>
  )
}
