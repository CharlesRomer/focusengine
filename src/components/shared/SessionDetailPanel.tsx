import { useEffect, useState, useRef } from 'react'
import { format, parseISO, differenceInSeconds } from 'date-fns'
import type { DBFocusSession, DBActivityEvent, DBAppClassification } from '@/lib/supabase'
import { useSessionEvents, useSessionClassifications, useSessionCaptures } from '@/hooks/useReports'
import { formatDuration, extractDomain } from '@/lib/reports'
import { scoreLabel } from '@/lib/scoring'

// ── Helpers ───────────────────────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score === null) return 'var(--text-tertiary)'
  if (score >= 70)    return 'var(--success)'
  if (score >= 50)    return 'var(--warning)'
  return 'var(--danger)'
}

function netDuration(s: DBFocusSession): number {
  if (!s.ended_at) return 0
  return Math.max(0, differenceInSeconds(parseISO(s.ended_at), parseISO(s.started_at)) - (s.total_pause_seconds ?? 0))
}

function distractionPct(events: DBActivityEvent[], classifs: DBAppClassification[]): number {
  // Use classifications if available, otherwise fall back to category
  const totalSecs = events.reduce((s, e) => s + (e.duration_seconds ?? 0), 0)
  if (totalSecs === 0) return 0

  let distrSecs = 0
  if (classifs.length > 0) {
    distrSecs = classifs.filter(c => c.classification === 'distraction').reduce((s, c) => s + c.duration_seconds, 0)
  } else {
    distrSecs = events.filter(e => e.category === 'off_task' || e.category === 'communication')
      .reduce((s, e) => s + (e.duration_seconds ?? 0), 0)
  }
  return Math.round((distrSecs / totalSecs) * 100)
}

function distrColor(pct: number): string {
  if (pct > 30) return 'var(--danger)'
  if (pct > 15) return 'var(--warning)'
  return 'var(--success)'
}

// ── Timeline segment ──────────────────────────────────────────────

interface TimelineSegmentProps {
  event: DBActivityEvent
  startMs: number
  totalMs: number
  classifMap: Map<string, 'focused' | 'distraction'>
}

function segmentColor(ev: DBActivityEvent, classifMap: Map<string, 'focused' | 'distraction'>): string {
  const isBrowser = ev.tab_url && ev.app_name && ['Chrome', 'Safari', 'Firefox', 'Edge', 'Arc', 'Brave'].some(b => ev.app_name!.includes(b))
  const key = (isBrowser && ev.tab_url) ? extractDomain(ev.tab_url) : (ev.app_name ?? '')
  const cls = classifMap.get(key)
  if (cls === 'focused')     return 'var(--success)'
  if (cls === 'distraction') return 'var(--danger)'
  if (ev.category === 'idle') return 'var(--bg-hover)'
  if (ev.category === 'meeting') return 'var(--text-tertiary)'
  return 'var(--text-tertiary)'
}

function TimelineSegment({ event, startMs, totalMs, classifMap }: TimelineSegmentProps) {
  const [hovered, setHovered] = useState(false)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const divRef = useRef<HTMLDivElement>(null)

  const evStart = new Date(event.started_at).getTime()
  const evEnd   = event.ended_at ? new Date(event.ended_at).getTime() : evStart + (event.duration_seconds ?? 0) * 1000
  const leftPct  = ((evStart - startMs) / totalMs) * 100
  const widthPct = Math.max(((evEnd - evStart) / totalMs) * 100, 0.3)
  const color = segmentColor(event, classifMap)

  const isBrowser = event.tab_url && event.app_name && ['Chrome', 'Safari', 'Firefox', 'Edge', 'Arc', 'Brave'].some(b => event.app_name!.includes(b))
  const label = isBrowser && event.tab_url ? extractDomain(event.tab_url) : (event.app_name ?? 'Unknown')

  return (
    <div
      ref={divRef}
      onMouseEnter={e => {
        const rect = e.currentTarget.getBoundingClientRect()
        setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top - 8 })
        setHovered(true)
      }}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        height: '100%',
        background: color,
        opacity: hovered ? 1 : 0.85,
        cursor: 'default',
      }}
    >
      {hovered && (
        <div style={{
          position: 'fixed',
          left: tooltipPos.x,
          top: tooltipPos.y,
          transform: 'translate(-50%, -100%)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 6,
          padding: '5px 10px',
          fontSize: 11,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
          zIndex: 9999,
          pointerEvents: 'none',
        }}>
          {label} · {formatDuration(event.duration_seconds ?? 0)}
        </div>
      )}
    </div>
  )
}

// ── App breakdown row ─────────────────────────────────────────────

function AppBreakdownRow({
  name, seconds, maxSeconds, cls,
}: { name: string; seconds: number; maxSeconds: number; cls: 'focused' | 'distraction' | null }) {
  const dotColor = cls === 'focused' ? 'var(--success)' : cls === 'distraction' ? 'var(--danger)' : 'var(--text-tertiary)'
  const barColor = dotColor
  const pct = maxSeconds > 0 ? (seconds / maxSeconds) * 100 : 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {name}
          </span>
          {cls && (
            <span style={{
              fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 4,
              background: cls === 'focused' ? 'rgba(61,184,122,0.15)' : 'rgba(217,92,92,0.15)',
              color: cls === 'focused' ? 'var(--success)' : 'var(--danger)',
            }}>
              {cls === 'focused' ? 'Focused' : 'Distraction'}
            </span>
          )}
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-hover)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3 }} />
        </div>
      </div>
      <span style={{ fontSize: 13, color: 'var(--text-tertiary)', flexShrink: 0, minWidth: 36, textAlign: 'right' }}>
        {formatDuration(seconds)}
      </span>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────

interface Props {
  session: DBFocusSession
  userId: string
  onClose: () => void
  onReclassify?: (session: DBFocusSession) => void
}

export function SessionDetailPanel({ session, userId, onClose, onReclassify }: Props) {
  const { data: events = [] }  = useSessionEvents(session.id, session.started_at, session.ended_at, userId)
  const { data: classifs = [] } = useSessionClassifications(session.id)
  const { data: captures = [] } = useSessionCaptures(session.id)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const dur     = netDuration(session)
  const distrPct = distractionPct(events, classifs)

  // Build classification map for timeline
  const classifMap = new Map<string, 'focused' | 'distraction'>()
  for (const c of classifs) {
    classifMap.set(c.domain ?? c.app_name, c.classification)
  }

  // Timeline calculation
  const sessionStartMs = new Date(session.started_at).getTime()
  const sessionEndMs   = session.ended_at ? new Date(session.ended_at).getTime() : Date.now()
  const totalMs        = Math.max(sessionEndMs - sessionStartMs, 1)

  // App breakdown aggregation
  const appMap = new Map<string, { seconds: number; cls: 'focused' | 'distraction' | null }>()
  for (const ev of events) {
    if (ev.category === 'idle') continue
    const isBrowser = ev.tab_url && ev.app_name && ['Chrome', 'Safari', 'Firefox', 'Edge', 'Arc', 'Brave'].some(b => ev.app_name!.includes(b))
    const name = (isBrowser && ev.tab_url) ? extractDomain(ev.tab_url) : (ev.app_name ?? 'Unknown')
    const existing = appMap.get(name)
    const cls = classifMap.get(name) ?? null
    if (existing) {
      existing.seconds += ev.duration_seconds ?? 0
    } else {
      appMap.set(name, { seconds: ev.duration_seconds ?? 0, cls })
    }
  }
  const appRows = Array.from(appMap.entries())
    .sort((a, b) => b[1].seconds - a[1].seconds)
  const maxAppSeconds = appRows[0]?.[1]?.seconds ?? 0

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 700,
          background: 'rgba(0,0,0,0.5)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 480, zIndex: 701,
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border-default)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '24px 24px 0',
          position: 'sticky', top: 0,
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: 16,
          zIndex: 1,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
              {session.name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              {format(parseISO(session.started_at), "EEEE, MMMM d, yyyy")}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-tertiary)', fontSize: 18,
              fontFamily: 'var(--font-sans)', padding: '0 4px', lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Stats row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            background: 'var(--bg-elevated)',
            borderRadius: 10, overflow: 'hidden',
            border: '1px solid var(--border-subtle)',
          }}>
            {[
              { label: 'Duration',      value: formatDuration(dur),                              color: 'var(--text-primary)' },
              { label: 'Focus score',   value: session.focus_score !== null ? String(session.focus_score) : '—', color: scoreColor(session.focus_score) },
              { label: 'Distraction',   value: `${distrPct}%`,                                  color: distrColor(distrPct) },
            ].map(({ label, value, color }, i) => (
              <div key={label} style={{
                padding: '14px 12px', textAlign: 'center',
                borderRight: i < 2 ? '1px solid var(--border-subtle)' : 'none',
              }}>
                <div style={{ fontSize: 24, fontWeight: 600, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Focus score label */}
          {session.focus_score !== null && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginTop: -16 }}>
              {scoreLabel(session.focus_score)}
            </div>
          )}

          {/* Timeline */}
          {events.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>
                Session timeline
              </div>
              <div style={{
                height: 32, borderRadius: 4, overflow: 'visible',
                background: 'var(--bg-elevated)',
                position: 'relative',
              }}>
                {events.map(ev => (
                  <TimelineSegment
                    key={ev.id}
                    event={ev}
                    startMs={sessionStartMs}
                    totalMs={totalMs}
                    classifMap={classifMap}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {format(parseISO(session.started_at), 'h:mma').toLowerCase()}
                </span>
                {session.ended_at && (
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {format(parseISO(session.ended_at), 'h:mma').toLowerCase()}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* App breakdown */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>
              Time by app
            </div>
            {appRows.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '12px 0' }}>
                No activity recorded for this session.
                <br />
                <span style={{ fontSize: 12 }}>Make sure CompassTracker is running.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {appRows.map(([name, { seconds, cls }]) => (
                  <AppBreakdownRow
                    key={name}
                    name={name}
                    seconds={seconds}
                    maxSeconds={maxAppSeconds}
                    cls={cls}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Output note */}
          {session.output_note && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Output note
              </div>
              <div style={{
                fontSize: 14, fontStyle: 'italic', color: 'var(--text-secondary)',
                lineHeight: 1.6, padding: '10px 16px',
                background: 'var(--bg-elevated)', borderRadius: 8,
                borderLeft: '2px solid var(--border-default)',
              }}>
                {session.output_note}
              </div>
            </div>
          )}

          {/* Quick captures */}
          {captures.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Captured during session
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {captures.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>·</span>
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>{c.text}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                      {format(parseISO(c.created_at), 'h:mma').toLowerCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Re-classify button */}
          {onReclassify && (
            <div style={{ paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => onReclassify(session)}
                style={{
                  background: 'none', border: '1px solid var(--border-default)',
                  borderRadius: 8, padding: '8px 16px',
                  color: 'var(--text-secondary)', fontSize: 13,
                  cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  width: '100%',
                }}
              >
                Edit app classifications
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
