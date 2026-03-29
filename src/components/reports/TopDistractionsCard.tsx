import { ReportCard } from './ReportCard'
import { extractDomain, formatDuration, CATEGORY_COLORS } from '@/lib/reports'
import { useActivityInWindow, useClassificationsInWindow } from '@/hooks/useReports'
import type { TimeWindow } from '@/lib/reports'

interface Props {
  userId: string
  window: TimeWindow
}

export function TopDistractionsCard({ userId, window }: Props) {
  const { data: activity, isLoading } = useActivityInWindow(userId, window)
  const { data: classifs = [] }        = useClassificationsInWindow(userId, window)

  // Build distraction map from user classifications (preferred source)
  const classifDistractions = new Map<string, number>()
  for (const c of classifs) {
    if (c.classification !== 'distraction') continue
    const key = c.domain ?? c.app_name
    classifDistractions.set(key, (classifDistractions.get(key) ?? 0) + c.duration_seconds)
  }

  // Fallback: category-based (off_task + communication) for items without classifications
  const categoryDistractions = new Map<string, number>()
  for (const ev of activity ?? []) {
    if (ev.category !== 'off_task' && ev.category !== 'communication') continue
    const s = ev.duration_seconds ?? 0
    if (s <= 0) continue
    const key = ev.tab_url ? extractDomain(ev.tab_url) : (ev.app_name ?? 'Unknown')
    // Only use category data if user hasn't classified this app
    if (!classifDistractions.has(key)) {
      categoryDistractions.set(key, (categoryDistractions.get(key) ?? 0) + s)
    }
  }

  // Merge: classifications take priority
  const merged = new Map<string, { seconds: number; source: 'classified' | 'category' }>()
  for (const [k, s] of classifDistractions) {
    merged.set(k, { seconds: s, source: 'classified' })
  }
  for (const [k, s] of categoryDistractions) {
    merged.set(k, { seconds: s, source: 'category' })
  }

  const sorted = Array.from(merged.entries())
    .sort((a, b) => b[1].seconds - a[1].seconds)
    .slice(0, 8)

  const maxSeconds = sorted[0]?.[1]?.seconds ?? 0
  const hasClassified = sorted.some(([, v]) => v.source === 'classified')
  const empty = !isLoading && sorted.length === 0

  return (
    <ReportCard
      title="Top distractions"
      subtitle={hasClassified ? 'Based on your classifications' : 'Off task + communication'}
      loading={isLoading}
      empty={empty}
      emptyMessage="No distractions recorded"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map(([source, { seconds, source: dataSource }]) => {
          const pct = maxSeconds > 0 ? (seconds / maxSeconds) * 100 : 0
          const color = dataSource === 'classified' ? 'var(--danger)' : CATEGORY_COLORS['off_task']
          return (
            <div key={source} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 2, background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {source}
                  </span>
                </div>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                  {formatDuration(seconds)}
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-hover)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
              </div>
            </div>
          )
        })}
      </div>
    </ReportCard>
  )
}
