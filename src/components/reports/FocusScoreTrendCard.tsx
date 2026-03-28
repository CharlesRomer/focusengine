import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { ReportCard } from './ReportCard'
import {
  CHART_TOOLTIP_STYLE,
  CHART_TICK_STYLE,
  CHART_GRID_PROPS,
  CHART_AXIS_PROPS,
  shortDate,
} from '@/lib/reports'
import { useFocusScoreTrend } from '@/hooks/useReports'
import type { TimeWindow } from '@/lib/reports'

interface Props {
  userId: string
  window: TimeWindow
}

export function FocusScoreTrendCard({ userId, window }: Props) {
  const { data, isLoading } = useFocusScoreTrend(userId, window)
  const empty = !isLoading && (!data || data.length === 0)

  return (
    <ReportCard
      title="Focus score trend"
      subtitle="Daily average — 75+ great, 50+ good"
      loading={isLoading}
      empty={empty}
    >
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data ?? []} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={CHART_TICK_STYLE}
            {...CHART_AXIS_PROPS}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={CHART_TICK_STYLE}
            {...CHART_AXIS_PROPS}
          />
          <ReferenceLine y={75} stroke="var(--success)" strokeDasharray="4 3" strokeOpacity={0.5} />
          <ReferenceLine y={50} stroke="var(--warning)" strokeDasharray="4 3" strokeOpacity={0.5} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            itemStyle={{ color: '#F0EFE8' }}
            formatter={(v: number) => [v, 'Score']}
            labelFormatter={shortDate}
            cursor={{ stroke: 'rgba(255,255,255,0.12)' }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--accent)', strokeWidth: 0 }}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ReportCard>
  )
}
