import { ReportCard } from './ReportCard'
import { tzHour, tzDow } from '@/lib/reports'
import { useActivityLast30Days } from '@/hooks/useReports'

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7) // 7am–8pm
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  userId: string
}

export function BestFocusWindowsCard({ userId }: Props) {
  const { data, isLoading } = useActivityLast30Days(userId)

  // Build [dow][hour] = total deep_work minutes
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  for (const ev of data ?? []) {
    const dow = tzDow(ev.started_at)
    const hour = tzHour(ev.started_at)
    grid[dow][hour] += (ev.duration_seconds ?? 0) / 60
  }

  // Max for color scaling
  let max = 0
  for (const row of grid) for (const v of row) if (v > max) max = v

  const empty = !isLoading && max === 0

  function cellOpacity(dow: number, hour: number): number {
    if (max === 0) return 0
    const v = grid[dow][hour]
    return v === 0 ? 0 : 0.08 + (v / max) * 0.72
  }

  return (
    <ReportCard
      title="Best focus windows"
      subtitle="Deep work intensity — last 30 days"
      loading={isLoading}
      empty={empty}
    >
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '32px repeat(14, 1fr)', gap: 3, minWidth: 360 }}>
          {/* Header row: hour labels */}
          <div />
          {HOURS.map((h) => (
            <div
              key={h}
              style={{
                fontSize: 10,
                color: 'var(--text-tertiary)',
                textAlign: 'center',
                paddingBottom: 4,
              }}
            >
              {h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`}
            </div>
          ))}

          {/* Data rows */}
          {DAYS.map((day, dowIdx) => (
            <>
              <div
                key={day}
                style={{
                  fontSize: 10,
                  color: 'var(--text-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {day}
              </div>
              {HOURS.map((hour) => {
                const opacity = cellOpacity(dowIdx, hour)
                return (
                  <div
                    key={hour}
                    title={`${Math.round(grid[dowIdx][hour])} min`}
                    style={{
                      height: 18,
                      borderRadius: 3,
                      background:
                        opacity > 0
                          ? `rgba(124,111,224,${opacity})`
                          : 'var(--bg-hover)',
                    }}
                  />
                )
              })}
            </>
          ))}
        </div>

        {/* Legend */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 10,
            justifyContent: 'flex-end',
          }}
        >
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Less</span>
          {[0.08, 0.26, 0.44, 0.62, 0.80].map((op) => (
            <div
              key={op}
              style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                background: `rgba(124,111,224,${op})`,
              }}
            />
          ))}
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>More</span>
        </div>
      </div>
    </ReportCard>
  )
}
