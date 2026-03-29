import { useState, KeyboardEvent, useRef, useEffect } from 'react'
import { format, addDays, subDays, isSameDay, isBefore, startOfDay } from 'date-fns'
import { getGreeting, formatLocalTime, todayLocal } from '@/lib/time'
import { useAuthStore } from '@/store/auth'
import { useSessionStore } from '@/store/session'
import { useQuickCaptures, useAddQuickCapture } from '@/hooks/useQuickCaptures'
import { CommitmentList } from '@/components/commitments/CommitmentList'
import { FocusCalendar } from '@/components/calendar/FocusCalendar'
import { StartSessionModal } from '@/components/shared/StartSessionModal'
import { useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { DBCommitment, DBFocusSession } from '@/lib/supabase'

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
  const location      = useLocation()

  const [quickCapture,   setQuickCapture]   = useState('')
  const [showStartModal, setShowStartModal] = useState(false)
  const [selectedDate,   setSelectedDate]   = useState<Date>(() => new Date())
  const captureRef = useRef<HTMLInputElement>(null)

  // ── Morning gate state ─────────────────────────────────────────
  type GateState = 'checking' | 'show' | 'hidden'
  const [gateState,    setGateState]    = useState<GateState>('checking')
  const [gateItems,    setGateItems]    = useState<string[]>([])
  const [gateInput,    setGateInput]    = useState('')
  const [gateSaving,   setGateSaving]   = useState(false)
  const gateInputRef = useRef<HTMLInputElement>(null)
  const forceGate    = (location.state as { forceGate?: boolean } | null)?.forceGate === true

  // ── End-of-day triage state ────────────────────────────────────
  const showEndOfDay = (location.state as { showEndOfDay?: boolean } | null)?.showEndOfDay === true
  const [eodSessions,    setEodSessions]    = useState<DBFocusSession[]>([])
  const [eodOpen,        setEodOpen]        = useState(false)
  const [eodActed,       setEodActed]       = useState<Set<string>>(new Set())

  // Check whether to show morning gate
  useEffect(() => {
    if (!user) { setGateState('hidden'); return }
    if (forceGate) { setGateState('show'); setTimeout(() => gateInputRef.current?.focus(), 100); return }
    if (sessionStorage.getItem('compassGateSkipped') === 'true') { setGateState('hidden'); return }
    if (new Date().getHours() >= 10) { setGateState('hidden'); return }

    supabase
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('date', format(new Date(), 'yyyy-MM-dd'))
      .is('deleted_at', null)
      .then(({ count, error }) => {
        if (error) { setGateState('hidden'); return }
        const shouldShow = (count ?? 0) === 0
        setGateState(shouldShow ? 'show' : 'hidden')
        if (shouldShow) setTimeout(() => gateInputRef.current?.focus(), 100)
      })
  }, [user?.id, forceGate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Check for unplanned sessions when end-of-day action fires
  useEffect(() => {
    if (!showEndOfDay || !user) return
    const today = format(new Date(), 'yyyy-MM-dd')
    supabase
      .from('focus_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_unplanned', true)
      .eq('status', 'ended')
      .gte('started_at', `${today}T00:00:00`)
      .lte('started_at', `${today}T23:59:59`)
      .then(({ data }) => {
        setEodSessions((data ?? []) as DBFocusSession[])
        setEodOpen(true)
      })
  }, [showEndOfDay, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Gate helpers ───────────────────────────────────────────────
  function handleGateKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const trimmed = gateInput.trim()
    if (!trimmed || gateItems.length >= 5) return
    setGateItems(prev => [...prev, trimmed])
    setGateInput('')
  }

  async function handleGateSave() {
    if (!user || gateItems.length === 0 || gateSaving) return
    setGateSaving(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    const rows = gateItems.map(text => ({
      user_id:     user.id,
      team_org_id: user.team_org_id ?? '',
      date:        today,
      text,
      status:      'open',
    }))
    const { error } = await supabase.from('commitments').insert(rows)
    if (error) {
      setGateSaving(false)
      return
    }
    setGateState('hidden')
    setGateSaving(false)
  }

  function handleGateSkip() {
    sessionStorage.setItem('compassGateSkipped', 'true')
    setGateState('hidden')
  }

  // ── EOD triage helpers ─────────────────────────────────────────
  async function handleEodAddAsCompleted(session: DBFocusSession) {
    if (!user) return
    await supabase.from('commitments').insert({
      user_id:     user.id,
      team_org_id: user.team_org_id ?? '',
      date:        format(new Date(), 'yyyy-MM-dd'),
      text:        session.name,
      status:      'done',
    })
    setEodActed(prev => new Set(prev).add(session.id))
  }

  async function handleEodNoteIt(session: DBFocusSession) {
    if (!user) return
    const dur = session.ended_at
      ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)
      : 0
    await supabase.from('quick_captures').insert({
      user_id: user.id,
      text:    `Unplanned: ${session.name}${dur > 0 ? ` (${dur} min)` : ''}`,
    })
    setEodActed(prev => new Set(prev).add(session.id))
  }

  function handleCapture(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const trimmed = quickCapture.trim()
    if (!trimmed) return
    addCapture.mutate(trimmed)
    setQuickCapture('')
  }

  // While checking gate, render nothing to prevent flash
  if (gateState === 'checking') return null

  // ── Morning gate ───────────────────────────────────────────────
  if (gateState === 'show') {
    const firstName = user?.display_name?.split(' ')[0] ?? 'there'
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 0, padding: '0 24px',
      }}>
        <h1 style={{ fontSize: 24, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 8px' }}>
          Good morning, {firstName}
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', margin: '0 0 28px' }}>
          What are you working on today?
        </p>

        {/* Commitment pills */}
        {gateItems.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 480, width: '100%', marginBottom: 12 }}>
            {gateItems.map((item, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--accent-subtle)', color: 'var(--accent)',
                borderRadius: 99, padding: '6px 12px', fontSize: 13,
              }}>
                {item}
                <button
                  onClick={() => setGateItems(prev => prev.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
                >×</button>
              </span>
            ))}
          </div>
        )}

        {/* Input */}
        {gateItems.length < 5 && (
          <input
            ref={gateInputRef}
            value={gateInput}
            onChange={e => setGateInput(e.target.value)}
            onKeyDown={handleGateKeyDown}
            placeholder="Describe your first commitment..."
            style={{
              width: '100%', maxWidth: 480, height: 52,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: 10, padding: '0 16px',
              color: 'var(--text-primary)', fontSize: 16,
              fontFamily: 'var(--font-sans)', outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--border-strong)' }}
            onBlur={e => { e.target.style.borderColor = 'var(--border-default)' }}
          />
        )}
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '8px 0 20px' }}>
          Press Enter to add · Add up to 5 commitments
        </p>

        {/* Start my day button */}
        {gateItems.length > 0 && (
          <button
            onClick={handleGateSave}
            disabled={gateSaving}
            style={{
              width: '100%', maxWidth: 480, height: 48,
              background: gateSaving ? 'var(--bg-hover)' : 'var(--accent)',
              border: 'none', borderRadius: 10,
              color: gateSaving ? 'var(--text-tertiary)' : 'white',
              fontSize: 15, fontWeight: 600, cursor: gateSaving ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-sans)', marginBottom: 10,
            }}
          >
            {gateSaving ? '...' : 'Start my day →'}
          </button>
        )}

        <button
          onClick={handleGateSkip}
          style={{
            background: 'none', border: 'none', fontSize: 13,
            color: 'var(--text-tertiary)', cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Skip for now →
        </button>
      </div>
    )
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

      {/* ── End-of-day triage modal ───────────────────────── */}
      {eodOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.7)',
        }}>
          <div style={{
            width: 480, maxHeight: '80vh', overflow: 'auto',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 16, padding: 32,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
              Time to wrap up
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-tertiary)' }}>
              Review commitments and document any unplanned work from today.
            </p>

            {eodSessions.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', fontStyle: 'italic', marginBottom: 20 }}>
                No unplanned sessions today.
              </p>
            ) : (
              <>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  You also worked on these unplanned things today
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  {eodSessions.map(s => {
                    const acted = eodActed.has(s.id)
                    const dur = s.ended_at
                      ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
                      : 0
                    return (
                      <div key={s.id} style={{
                        padding: '10px 12px',
                        background: acted ? 'var(--bg-surface)' : 'var(--bg-hover)',
                        borderRadius: 8, opacity: acted ? 0.5 : 1,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: acted ? 0 : 8 }}>
                          <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                            ⚡ {s.name}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{dur} min</span>
                        </div>
                        {!acted && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => void handleEodAddAsCompleted(s)}
                              style={{
                                padding: '4px 10px', fontSize: 12, borderRadius: 6,
                                background: 'var(--accent-subtle)', border: '1px solid var(--accent)',
                                color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                              }}
                            >Add as completed</button>
                            <button
                              onClick={() => void handleEodNoteIt(s)}
                              style={{
                                padding: '4px 10px', fontSize: 12, borderRadius: 6,
                                background: 'none', border: '1px solid var(--border-default)',
                                color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                              }}
                            >Note it and move on</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            <button
              onClick={() => setEodOpen(false)}
              style={{
                display: 'block', width: '100%', padding: '12px',
                background: 'var(--accent)', border: 'none', borderRadius: 8,
                color: 'white', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}
            >
              Done reviewing
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
