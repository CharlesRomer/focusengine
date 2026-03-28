import { useState, KeyboardEvent, useRef, useEffect } from 'react'
import { format, addDays, subDays, isSameDay, isBefore, startOfDay } from 'date-fns'
import { getGreeting, formatLocalTime, todayLocal } from '@/lib/time'
import { useAuthStore } from '@/store/auth'
import { useSessionStore } from '@/store/session'
import { useQuickCaptures, useAddQuickCapture } from '@/hooks/useQuickCaptures'
import { CommitmentList } from '@/components/commitments/CommitmentList'
import { FocusCalendar } from '@/components/calendar/FocusCalendar'
import { StartSessionModal } from '@/components/shared/StartSessionModal'

// ── Date nav bar ──────────────────────────────────────────────────
interface DateNavBarProps {
  date: Date
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

function DateNavBar({ date, onPrev, onNext, onToday }: DateNavBarProps) {
  const isToday = isSameDay(date, new Date())

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 16px',
      borderBottom: '1px solid var(--border-subtle)',
      flexShrink: 0,
    }}>
      <button
        onClick={onPrev}
        style={{
          width: 32, height: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', borderRadius: 6,
          color: 'var(--text-secondary)', cursor: 'pointer',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        title="Previous day"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', flex: 1, textAlign: 'center' }}>
        {format(date, 'EEEE, MMMM d')}
      </span>

      {!isToday && (
        <button
          onClick={onToday}
          style={{
            padding: '4px 10px',
            background: 'var(--accent-subtle)',
            border: 'none',
            borderRadius: 99,
            color: 'var(--accent)',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
          }}
        >
          Today
        </button>
      )}

      <button
        onClick={onNext}
        style={{
          width: 32, height: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', borderRadius: 6,
          color: 'var(--text-secondary)', cursor: 'pointer',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        title="Next day"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────
export function TodayScreen() {
  const user          = useAuthStore(s => s.user)
  const activeSession = useSessionStore(s => s.activeSession)
  const addCapture    = useAddQuickCapture()
  const { data: captures } = useQuickCaptures()

  const [quickCapture,   setQuickCapture]   = useState('')
  const [showStartModal, setShowStartModal] = useState(false)
  const [selectedDate,   setSelectedDate]   = useState<Date>(() => new Date())
  const captureRef = useRef<HTMLInputElement>(null)

  const isToday = isSameDay(selectedDate, new Date())
  const isPast  = isBefore(startOfDay(selectedDate), startOfDay(new Date()))
  const dateStr = format(selectedDate, 'yyyy-MM-dd')
  const greeting = `${getGreeting()}, ${user?.display_name?.split(' ')[0] ?? 'there'}`

  // ⌘K — only focus this input when no session is active
  useEffect(() => {
    function handler(e: globalThis.KeyboardEvent) {
      if (e.metaKey && e.key === 'k') {
        if (useSessionStore.getState().activeSession) return
        e.preventDefault()
        captureRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  function handleCapture(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const trimmed = quickCapture.trim()
    if (!trimmed) return
    addCapture.mutate(trimmed)
    setQuickCapture('')
  }

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      {/* ── Left panel ─────────────────────────────────────── */}
      <div
        className="flex flex-col border-r overflow-y-auto"
        style={{
          width: 320,
          flexShrink: 0,
          borderColor: 'var(--border-subtle)',
          background: 'var(--bg-surface)',
        }}
      >
        {/* Header — only show when on today */}
        {isToday && (
          <div className="px-6 pt-6 pb-4 flex-shrink-0">
            <p className="text-[var(--text-xs)] text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
              {format(new Date(), 'EEEE, MMMM d')}
            </p>
            <h1 className="text-[var(--text-lg)] font-semibold text-[var(--text-primary)]">{greeting}</h1>
          </div>
        )}

        {/* Past / future day header */}
        {!isToday && (
          <div className="px-6 pt-6 pb-4 flex-shrink-0">
            <p className="text-[var(--text-xs)] text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
              {isPast ? 'Past day' : 'Upcoming'}
            </p>
            <h1 className="text-[var(--text-lg)] font-semibold text-[var(--text-primary)]">
              {format(selectedDate, 'EEEE, MMMM d')}
            </h1>
          </div>
        )}

        {/* Commitments section */}
        <div
          className="flex-shrink-0 border-b pb-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center justify-between px-6 mb-2">
            <span className="text-[var(--text-xs)] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
              {isToday ? "Today's commitments" : format(selectedDate, 'EEE') + "'s commitments"}
            </span>
          </div>
          <CommitmentList date={dateStr} readOnly={isPast} />
        </div>

        {/* Start focus session — only show on today */}
        {isToday && (
          <div className="flex-shrink-0 px-3 pt-3 pb-1">
            {activeSession ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 12px',
                background: 'var(--accent-subtle)',
                border: '1px solid rgba(124,111,224,0.2)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-xs)', color: 'var(--accent)',
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} className="session-dot--active" />
                Session in progress
              </div>
            ) : (
              <button
                onClick={() => setShowStartModal(true)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  width: '100%', padding: '8px 0',
                  background: 'var(--accent-subtle)',
                  border: '1px solid rgba(124,111,224,0.2)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--accent)',
                  fontSize: 'var(--text-xs)', fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  transition: 'background 150ms, border-color 150ms',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(124,111,224,0.18)'
                  e.currentTarget.style.borderColor = 'var(--accent)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'var(--accent-subtle)'
                  e.currentTarget.style.borderColor = 'rgba(124,111,224,0.2)'
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M5 4l3 2-3 2V4z" fill="currentColor"/>
                </svg>
                Start focus session
              </button>
            )}
          </div>
        )}

        {/* Quick captures list — only on today */}
        {isToday && (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <p className="text-[var(--text-xs)] font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-3">
              Captured today
            </p>
            {!captures || captures.length === 0 ? (
              <p className="text-[var(--text-sm)] text-[var(--text-tertiary)]">Nothing captured yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {captures.map(c => (
                  <div key={c.id} className="flex items-start gap-2">
                    <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] mt-0.5 flex-shrink-0 tabular-nums">
                      {formatLocalTime(c.created_at, 'h:mm')}
                    </span>
                    <p className="text-[var(--text-sm)] text-[var(--text-secondary)] leading-5">{c.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quick capture input — only on today */}
        {isToday && (
          <div
            className="flex-shrink-0 px-6 py-4 border-t"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <input
              ref={captureRef}
              value={quickCapture}
              onChange={e => setQuickCapture(e.target.value)}
              onKeyDown={handleCapture}
              disabled={addCapture.isPending}
              placeholder="Capture a thought + Enter  ⌘K"
              className="w-full h-9 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-[var(--radius-md)] px-3 text-[var(--text-sm)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] focus:shadow-[0_0_0_3px_rgba(124,111,224,0.15)] transition-all disabled:opacity-50"
            />
          </div>
        )}
      </div>

      {/* ── Right panel — calendar day view ───────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <DateNavBar
          date={selectedDate}
          onPrev={() => setSelectedDate(d => subDays(d, 1))}
          onNext={() => setSelectedDate(d => addDays(d, 1))}
          onToday={() => setSelectedDate(new Date())}
        />
        <FocusCalendar
          showToolbar={false}
          initialView="timeGridDay"
          externalDate={selectedDate}
        />
      </div>

      {/* Start session modal */}
      <StartSessionModal
        open={showStartModal}
        onClose={() => setShowStartModal(false)}
      />
    </div>
  )
}
