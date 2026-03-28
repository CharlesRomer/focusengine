import { ReportCard } from './ReportCard'
import { extractDomain, formatDuration, CATEGORY_COLORS, CATEGORY_LABELS } from '@/lib/reports'
import { useActivityInWindow } from '@/hooks/useReports'
import type { TimeWindow } from '@/lib/reports'

interface Props {
  userId: string
  window: TimeWindow
}

export function TopDistractionsCard({ userId, window }: Props) {
  const { data, isLoading } = useActivityInWindow(userId, window)

  // Aggregate off_task + communication events by domain/app
  const bySource = new Map<string, { seconds: number; category: 'off_task' | 'communication' }>()

  for (const ev of data ?? []) {
    if (ev.category !== 'off_task' && ev.category !== 'communication') continue
    const s = ev.duration_seconds ?? 0
    if (s <= 0) continue
    const key = ev.tab_url ? extractDomain(ev.tab_url) : (ev.app_name ?? 'Unknown')
    const existing = bySource.get(key)
    if (existing) {
      existing.seconds += s
    } else {
      bySource.set(key, { seconds: s, category: ev.category as 'off_task' | 'communication' })
    }
  }

  const sorted = Array.from(bySource.entries())
    .sort((a, b) => b[1].seconds - a[1].seconds)
    .slice(0, 8)

  const maxSeconds = sorted[0]?.[1]?.seconds ?? 0
  const empty = !isLoading && sorted.length === 0

  return (
    <ReportCard
      title="Top distractions"
      subtitle="Off task + communication"
      loading={isLoading}
      empty={empty}
      emptyMessage="No off-task or communication activity"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map(([source, { seconds, category }]) => {
          const pct = maxSeconds > 0 ? (seconds / maxSeconds) * 100 : 0
          return (
            <div key={source} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                      maxWidth: 160,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {source}
                  </span>
                </div>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                  {formatDuration(seconds)}
                </span>
              </div>
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: 'var(--bg-hover)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: CATEGORY_COLORS[category],
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </ReportCard>
  )
}
