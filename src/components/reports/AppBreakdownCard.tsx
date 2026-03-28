import { useState } from 'react'
import { ReportCard } from './ReportCard'
import { extractDomain, formatDuration, CATEGORY_COLORS, CATEGORY_LABELS } from '@/lib/reports'
import { useAppBreakdown } from '@/hooks/useReports'
import type { TimeWindow } from '@/lib/reports'
import type { ActivityCategory } from '@/lib/supabase'

interface Props {
  userId: string
  window: TimeWindow
}

interface AppRow {
  key: string
  label: string
  seconds: number
  category: ActivityCategory
  isWeb: boolean
}

const SHOW_INITIAL = 8

export function AppBreakdownCard({ userId, window }: Props) {
  const { data, isLoading } = useAppBreakdown(userId, window)
  const [showAll, setShowAll] = useState(false)

  // Aggregate by app or domain
  const byApp = new Map<string, { seconds: number; category: ActivityCategory; isWeb: boolean; label: string }>()

  for (const ev of data ?? []) {
    const s = ev.duration_seconds ?? 0
    if (s <= 0) continue

    let key: string
    let label: string
    let isWeb = false

    if (ev.tab_url) {
      const domain = extractDomain(ev.tab_url)
      key = `web:${domain}`
      label = domain
      isWeb = true
    } else {
      key = `app:${ev.app_name ?? 'Unknown'}`
      label = ev.app_name ?? 'Unknown'
    }

    const existing = byApp.get(key)
    if (existing) {
      existing.seconds += s
    } else {
      byApp.set(key, { seconds: s, category: ev.category, isWeb, label })
    }
  }

  const sorted: AppRow[] = Array.from(byApp.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.seconds - a.seconds)

  const totalSeconds = sorted.reduce((s, r) => s + r.seconds, 0)
  const maxSeconds = sorted[0]?.seconds ?? 0
  const visible = showAll ? sorted : sorted.slice(0, SHOW_INITIAL)
  const empty = !isLoading && sorted.length === 0

  return (
    <ReportCard
      title="App & site breakdown"
      subtitle="All tracked activity by app or domain"
      loading={isLoading}
      empty={empty}
      emptyMessage="No activity data for this period"
    >
      {/* Total */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-4)',
          paddingBottom: 'var(--space-3)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
          {sorted.length} apps / sites
        </span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          {formatDuration(totalSeconds)} total
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visible.map((row) => {
          const pct = maxSeconds > 0 ? (row.seconds / maxSeconds) * 100 : 0
          const sharePct = totalSeconds > 0 ? Math.round((row.seconds / totalSeconds) * 100) : 0

          return (
            <div key={row.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Category dot */}
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 2,
                    background: CATEGORY_COLORS[row.category],
                    flexShrink: 0,
                  }}
                />
                {/* App/domain name */}
                <span
                  style={{
                    flex: 1,
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.label}
                </span>
                {/* Duration */}
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', flexShrink: 0 }}>
                  {formatDuration(row.seconds)}
                </span>
                {/* Share % */}
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-tertiary)',
                    minWidth: 30,
                    textAlign: 'right',
                    flexShrink: 0,
                  }}
                >
                  {sharePct}%
                </span>
              </div>
              {/* Bar */}
              <div
                style={{
                  height: 3,
                  borderRadius: 2,
                  background: 'var(--bg-hover)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: CATEGORY_COLORS[row.category],
                    borderRadius: 2,
                    opacity: 0.7,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {sorted.length > SHOW_INITIAL && (
        <button
          onClick={() => setShowAll((v) => !v)}
          style={{
            marginTop: 'var(--space-3)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 'var(--text-xs)',
            color: 'var(--accent)',
            padding: 0,
          }}
        >
          {showAll ? 'Show less' : `Show ${sorted.length - SHOW_INITIAL} more`}
        </button>
      )}

      {/* Category legend */}
      <div
        style={{
          marginTop: 'var(--space-4)',
          paddingTop: 'var(--space-3)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 16px',
        }}
      >
        {(Object.keys(CATEGORY_COLORS) as ActivityCategory[])
          .filter((cat) => cat !== 'idle')
          .map((cat) => (
            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 2,
                  background: CATEGORY_COLORS[cat],
                }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                {CATEGORY_LABELS[cat]}
              </span>
            </div>
          ))}
      </div>
    </ReportCard>
  )
}
