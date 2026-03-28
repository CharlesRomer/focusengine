import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { ReportCard } from './ReportCard'
import {
  CHART_TOOLTIP_STYLE,
  CHART_TICK_STYLE,
  CHART_GRID_PROPS,
  CHART_AXIS_PROPS,
  executionRate,
} from '@/lib/reports'
import { useCommitmentsInWindow } from '@/hooks/useReports'
import type { TimeWindow } from '@/lib/reports'
import type { DBCommitment } from '@/lib/supabase'

interface Props {
  userId: string
  window: TimeWindow
}

export function CommitmentsCard({ userId, window }: Props) {
  const { data, isLoading } = useCommitmentsInWindow(userId, window)

  const empty = !isLoading && (!data || data.length === 0)

  // Group by date
  const byDate = new Map<string, { done: number; incomplete: number; open: number }>()
  for (const c of data ?? []) {
    const d = c.date
    if (!byDate.has(d)) byDate.set(d, { done: 0, incomplete: 0, open: 0 })
    const entry = byDate.get(d)!
    if (c.status === 'done') entry.done++
    else if (c.status === 'incomplete') entry.incomplete++
    else entry.open++
  }

  const chartData = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({
      date,
      Done: counts.done,
      Incomplete: counts.incomplete,
      Open: counts.open,
    }))

  const totalDone = (data ?? []).filter((c) => c.status === 'done').length
  const totalAll = (data ?? []).length
  const rate = executionRate(totalDone, totalAll)

  const incompleteItems = (data ?? []).filter(
    (c): c is DBCommitment => c.status === 'incomplete'
  )

  return (
    <ReportCard title="Commitments" loading={isLoading} empty={empty}>
      {/* Summary row */}
      <div style={{ display: 'flex', gap: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
        <Stat label="Total" value={totalAll} />
        <Stat label="Done" value={totalDone} color="var(--success)" />
        <Stat label="Incomplete" value={incompleteItems.length} color="var(--danger)" />
        <Stat label="Execution rate" value={`${rate}%`} color={rate >= 80 ? 'var(--success)' : rate >= 50 ? 'var(--warning)' : 'var(--danger)'} />
      </div>

      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={chartData} margin={{ top: 0, right: 8, bottom: 0, left: -16 }} barSize={8}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => format(parseISO(v), 'M/d')}
            tick={CHART_TICK_STYLE}
            {...CHART_AXIS_PROPS}
          />
          <YAxis
            allowDecimals={false}
            tick={CHART_TICK_STYLE}
            {...CHART_AXIS_PROPS}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            itemStyle={{ color: '#F0EFE8' }}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            labelFormatter={(v) => format(parseISO(v), 'EEE M/d')}
          />
          <Bar dataKey="Done" stackId="a" fill="var(--success)" isAnimationActive={false} radius={[0, 0, 0, 0]} />
          <Bar dataKey="Incomplete" stackId="a" fill="var(--danger)" isAnimationActive={false} radius={[0, 0, 0, 0]} />
          <Bar dataKey="Open" stackId="a" fill="var(--text-tertiary)" isAnimationActive={false} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {incompleteItems.length > 0 && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 6 }}>
            Incomplete
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {incompleteItems.slice(0, 5).map((c) => (
              <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-tertiary)',
                    flexShrink: 0,
                    minWidth: 36,
                  }}
                >
                  {format(parseISO(c.date), 'M/d')}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {c.text}
                </span>
              </div>
            ))}
            {incompleteItems.length > 5 && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                +{incompleteItems.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}
    </ReportCard>
  )
}

function Stat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 'var(--text-lg)', fontWeight: 500, color: color ?? 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  )
}
