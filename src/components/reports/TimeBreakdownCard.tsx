import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { ReportCard } from './ReportCard'
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  formatDuration,
  CHART_TOOLTIP_STYLE,
} from '@/lib/reports'
import { useActivityInWindow } from '@/hooks/useReports'
import type { TimeWindow } from '@/lib/reports'
import type { ActivityCategory } from '@/lib/supabase'

interface Props {
  userId: string
  window: TimeWindow
}

export function TimeBreakdownCard({ userId, window }: Props) {
  const { data, isLoading } = useActivityInWindow(userId, window)

  const byCategory = new Map<ActivityCategory, number>()
  for (const ev of data ?? []) {
    const s = ev.duration_seconds ?? 0
    if (s <= 0) continue
    byCategory.set(ev.category, (byCategory.get(ev.category) ?? 0) + s)
  }

  const displayCategories: ActivityCategory[] = ['deep_work', 'meeting', 'communication', 'off_task', 'untracked']
  const chartData = displayCategories
    .map((cat) => ({ cat, seconds: byCategory.get(cat) ?? 0 }))
    .filter((d) => d.seconds > 0)

  // Idle is always in legend (even 0), in donut only if > 0
  const idleSeconds = byCategory.get('idle') ?? 0
  const idleChartEntry = idleSeconds > 0 ? [{ cat: 'idle' as ActivityCategory, seconds: idleSeconds }] : []
  const fullChartData = [...chartData, ...idleChartEntry]

  const totalTracked = fullChartData.reduce((a, b) => a + b.seconds, 0)

  // Legend always includes idle row
  const legendData: { cat: ActivityCategory; seconds: number }[] = [
    ...chartData,
    { cat: 'idle', seconds: idleSeconds },
  ]

  return (
    <ReportCard
      title="Time breakdown"
      loading={isLoading}
      empty={chartData.length === 0 && idleSeconds === 0}
    >
      <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center' }}>
        <div style={{ flexShrink: 0, width: 160, height: 160 }}>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={fullChartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={72}
                dataKey="seconds"
                isAnimationActive={false}
                strokeWidth={0}
              >
                {fullChartData.map((entry) => (
                  <Cell key={entry.cat} fill={CATEGORY_COLORS[entry.cat]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) => [formatDuration(v), '']}
                contentStyle={CHART_TOOLTIP_STYLE}
                itemStyle={{ color: '#F0EFE8' }}
                cursor={false}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {legendData.map(({ cat, seconds }) => {
            const pct = totalTracked > 0 ? Math.round((seconds / totalTracked) * 100) : 0
            return (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: CATEGORY_COLORS[cat],
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  {CATEGORY_LABELS[cat]}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                  {formatDuration(seconds)}
                </span>
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-tertiary)',
                    minWidth: 32,
                    textAlign: 'right',
                  }}
                >
                  {pct}%
                </span>
              </div>
            )
          })}

          <div
            style={{
              marginTop: 4,
              paddingTop: 8,
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              Total tracked
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              {formatDuration(totalTracked)}
            </span>
          </div>
        </div>
      </div>
    </ReportCard>
  )
}
