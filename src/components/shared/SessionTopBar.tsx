import { useState, useEffect, useRef } from 'react'
import { useSessionStore } from '@/store/session'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import type { DBFocusSession, DBActivityEvent, ActivityCategory } from '@/lib/supabase'
import { toast } from '@/store/ui'
import { computeLiveScore, computeFocusScore, scoreFocusRatio, scoreLabel, type AppClassificationInput } from '@/lib/scoring'
import { extractDomain, formatDuration } from '@/lib/reports'
import { QuickCapturePopover } from './QuickCapturePopover'

// ── Helpers ───────────────────────────────────────────────────────

function computeElapsed(session: DBFocusSession): number {
  if (session.status === 'paused' && session.paused_at) {
    return (
      (new Date(session.paused_at).getTime() - new Date(session.started_at).getTime()) / 1000
      - session.total_pause_seconds
    )
  }
  return (
    (Date.now() - new Date(session.started_at).getTime()) / 1000
    - session.total_pause_seconds
  )
}

function formatTimer(secs: number): string {
  const s  = Math.max(0, Math.floor(secs))
  const h  = Math.floor(s / 3600)
  const m  = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

function scoreColor(score: number | null): string {
  if (score === null) return 'var(--text-tertiary)'
  if (score >= 70)    return 'var(--success)'
  if (score >= 50)    return 'var(--warning)'
  return 'var(--danger)'
}

async function withRetry(
  fn: () => PromiseLike<{ error: unknown }>,
  errorMsg: string,
  onPermanentFail: () => void,
): Promise<boolean> {
  const r1 = await fn()
  if (!r1.error) return true
  toast(errorMsg, 'error')
  await new Promise(resolve => setTimeout(resolve, 2000))
  const r2 = await fn()
  if (!r2.error) return true
  onPermanentFail()
  return false
}

// ── Activity fetching with session_id fallback ────────────────────

async function fetchSessionEvents(session: DBFocusSession): Promise<DBActivityEvent[]> {
  // Try by session_id first
  const { data: byId } = await supabase
    .from('activity_events')
    .select('*')
    .eq('session_id', session.id)
  if (byId && byId.length > 0) return byId as DBActivityEvent[]

  // Fallback: time-range query (for when Swift agent hasn't set session_id yet)
  const endAt = session.ended_at ?? new Date().toISOString()
  const { data: byTime } = await supabase
    .from('activity_events')
    .select('*')
    .eq('user_id', session.user_id)
    .gte('started_at', session.started_at)
    .lte('started_at', endAt)
    .neq('category', 'idle')
  return (byTime ?? []) as DBActivityEvent[]
}

// ── App row grouping ──────────────────────────────────────────────

interface AppRow {
  key: string
  displayName: string
  appName: string
  domain: string | null
  durationSeconds: number
  category: ActivityCategory | null
}

const BROWSER_NAMES = ['Chrome', 'Safari', 'Firefox', 'Edge', 'Arc', 'Brave', 'Opera']

function isBrowserApp(appName: string | null): boolean {
  if (!appName) return false
  return BROWSER_NAMES.some(b => appName.includes(b))
}

function groupEventsToRows(events: DBActivityEvent[]): AppRow[] {
  const map = new Map<string, AppRow>()
  for (const ev of events) {
    if (ev.category === 'idle') continue
    const dur = ev.duration_seconds ?? 0
    if (dur <= 0) continue

    let key: string
    let displayName: string
    let domain: string | null = null

    if (isBrowserApp(ev.app_name) && ev.tab_url) {
      domain = extractDomain(ev.tab_url)
      key = `browser:${domain}`
      displayName = domain
    } else {
      key = `app:${ev.app_name ?? 'Unknown'}`
      displayName = ev.app_name ?? 'Unknown'
    }

    const existing = map.get(key)
    if (existing) {
      existing.durationSeconds += dur
    } else {
      map.set(key, {
        key,
        displayName,
        appName: ev.app_name ?? 'Unknown',
        domain,
        durationSeconds: dur,
        category: ev.category,
      })
    }
  }
  return Array.from(map.values())
    .filter(r => r.durationSeconds > 0)
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, 8)
}

// ── Learning system ───────────────────────────────────────────────

async function fetchUserDefaults(userId: string): Promise<Map<string, 'focused' | 'distraction'>> {
  const { data } = await supabase
    .from('app_classifications')
    .select('app_name, domain, classification')
    .eq('user_id', userId)
  if (!data) return new Map()

  const counts = new Map<string, { focused: number; distraction: number }>()
  for (const row of data) {
    const k = (row.domain ?? row.app_name) as string
    const c = counts.get(k) ?? { focused: 0, distraction: 0 }
    if (row.classification === 'focused') c.focused++
    else c.distraction++
    counts.set(k, c)
  }
  const out = new Map<string, 'focused' | 'distraction'>()
  for (const [k, { focused, distraction }] of counts) {
    if (focused + distraction >= 1)
      out.set(k, focused >= distraction ? 'focused' : 'distraction')
  }
  return out
}

function preFill(row: AppRow, userDefaults: Map<string, 'focused' | 'distraction'>):
  { choice: 'focused' | 'distraction' | null; source: 'usual' | 'category' | null } {
  // Learning system takes priority
  const defaultKey = row.domain ?? row.displayName
  const usual = userDefaults.get(defaultKey)
  if (usual) return { choice: usual, source: 'usual' }

  // Category-based fallback
  if (row.category === 'deep_work') return { choice: 'focused',     source: 'category' }
  if (row.category === 'off_task')  return { choice: 'distraction', source: 'category' }
  return { choice: null, source: null }
}

// ── Progress indicator ────────────────────────────────────────────

function StepIndicator({ step }: { step: 'note' | 'classify' | 'reveal' }) {
  if (step === 'reveal') return null
  const active1 = step === 'note'
  const active2 = step === 'classify'
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: active1 ? 'var(--accent)' : 'var(--border-default)',
      }} />
      <div style={{ width: 32, height: 1, background: 'var(--border-subtle)' }} />
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: active2 ? 'var(--accent)' : 'var(--border-subtle)',
      }} />
    </div>
  )
}

// ── Toggle button ─────────────────────────────────────────────────

function ClassifyBtn({
  label, icon, selected, color, onSelect,
}: {
  label: string; icon: string; selected: boolean; color: 'success' | 'danger'; onSelect: () => void
}) {
  const isSuccess = color === 'success'
  const selBg      = isSuccess ? 'rgba(61,184,122,0.15)' : 'rgba(217,92,92,0.15)'
  const selText    = isSuccess ? 'var(--success)'        : 'var(--danger)'
  const selBorder  = isSuccess ? 'rgba(61,184,122,0.3)'  : 'rgba(217,92,92,0.3)'

  return (
    <button
      onClick={onSelect}
      style={{
        height: 28, padding: '0 12px',
        borderRadius: 6, fontSize: 12, fontWeight: 500,
        cursor: 'pointer', fontFamily: 'var(--font-sans)',
        transition: 'all 100ms',
        background:  selected ? selBg      : 'var(--bg-elevated)',
        color:       selected ? selText    : 'var(--text-tertiary)',
        border:      `1px solid ${selected ? selBorder : 'var(--border-default)'}`,
      }}
    >
      {icon} {label}
    </button>
  )
}

// ── Multi-step end-session modal ──────────────────────────────────

type EndStep = 'note' | 'classify' | 'reveal'

interface EndModalProps {
  session: DBFocusSession
  elapsed: number
  liveScore: number | null
  userId: string | undefined
  onDone: (finalScore: number | null) => void
  onCancel: () => void
}

function EndSessionModal({
  session, elapsed, liveScore, userId, onDone, onCancel,
}: EndModalProps) {
  const [step,         setStep]         = useState<EndStep>('note')
  const [note,         setNote]         = useState('')
  const [share,        setShare]        = useState(false)
  const [noteError,    setNoteError]    = useState('')
  const [rows,         setRows]         = useState<AppRow[]>([])
  const [loadingRows,  setLoadingRows]  = useState(false)
  const [choices,      setChoices]      = useState<Map<string, 'focused' | 'distraction'>>(new Map())
  const [userDefaults, setUserDefaults] = useState<Map<string, 'focused' | 'distraction'>>(new Map())
  const [usualSources, setUsualSources] = useState<Set<string>>(new Set())
  const [hasPrefill,   setHasPrefill]   = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [revealScore,  setRevealScore]  = useState<number | null>(null)
  const [revealFocused, setRevealFocused] = useState(0)
  const [revealDistraction, setRevealDistraction] = useState(0)
  const [revealTotal,  setRevealTotal]  = useState(0)
  const [doneEnabled,  setDoneEnabled]  = useState(false)
  const [saveBanner,   setSaveBanner]   = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 50)
  }, [])

  useEffect(() => {
    if (step === 'reveal') {
      const t = setTimeout(() => setDoneEnabled(true), 1500)
      return () => clearTimeout(t)
    }
  }, [step])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); if (step === 'note') onCancel() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [step, onCancel])

  // ── Step 1 → Step 2 ──────────────────────────────────────────
  async function handleNoteNext() {
    setNoteError('')
    if (note.trim().length < 10) {
      setNoteError('Please describe what you accomplished (at least 10 characters)')
      return
    }
    setLoadingRows(true)

    const [events, defaults] = await Promise.all([
      fetchSessionEvents(session),
      userId ? fetchUserDefaults(userId) : Promise.resolve(new Map<string, 'focused' | 'distraction'>()),
    ])

    const grouped = groupEventsToRows(events)
    const initialChoices = new Map<string, 'focused' | 'distraction'>()
    const usualSet = new Set<string>()
    let anyPrefilled = false

    for (const row of grouped) {
      const { choice, source } = preFill(row, defaults)
      if (choice) {
        initialChoices.set(row.key, choice)
        anyPrefilled = true
        if (source === 'usual') usualSet.add(row.key)
      }
    }

    setRows(grouped)
    setUserDefaults(defaults)
    setUsualSources(usualSet)
    setChoices(initialChoices)
    setHasPrefill(anyPrefilled)
    setLoadingRows(false)
    setStep('classify')
  }

  // ── Skip classification ───────────────────────────────────────
  async function handleSkip() {
    setSaving(true)
    const ended_at = new Date().toISOString()
    const sessionDuration = computeElapsed(session)
    const events = await fetchSessionEvents(session)
    const finalScore = computeLiveScore({ session: { ...session, ended_at }, activityEvents: events })

    await commitSession(ended_at, finalScore)
    const focusedSecs = 0
    const distractionSecs = 0
    const totalSecs = events.reduce((s, e) => s + (e.duration_seconds ?? 0), 0)

    setRevealScore(finalScore)
    setRevealFocused(focusedSecs)
    setRevealDistraction(distractionSecs)
    setRevealTotal(totalSecs)
    setSaving(false)
    setStep('reveal')
    void sessionDuration
  }

  // ── Step 2 → Step 3 ──────────────────────────────────────────
  async function handleCalculate() {
    setSaving(true)
    const ended_at = new Date().toISOString()
    const sessionDuration = computeElapsed(session)

    const classificationList: AppClassificationInput[] = []
    const dbRows: object[] = []

    for (const row of rows) {
      const cls = choices.get(row.key)
      if (!cls) continue
      classificationList.push({ classification: cls, duration_seconds: row.durationSeconds })
      dbRows.push({
        session_id:       session.id,
        user_id:          session.user_id,
        app_name:         row.appName,
        domain:           row.domain,
        classification:   cls,
        duration_seconds: row.durationSeconds,
      })
    }

    // Upsert classifications (delete existing for this session first, then insert)
    if (dbRows.length > 0) {
      await supabase.from('app_classifications').delete().eq('session_id', session.id)
      await supabase.from('app_classifications').insert(dbRows)
    }

    const finalScore = computeFocusScore(classificationList, sessionDuration)
    await commitSession(ended_at, finalScore)

    const focusedSecs     = classificationList.filter(c => c.classification === 'focused').reduce((s, c) => s + c.duration_seconds, 0)
    const distractionSecs = classificationList.filter(c => c.classification === 'distraction').reduce((s, c) => s + c.duration_seconds, 0)
    const totalSecs       = rows.reduce((s, r) => s + r.durationSeconds, 0)

    setRevealScore(finalScore)
    setRevealFocused(focusedSecs)
    setRevealDistraction(distractionSecs)
    setRevealTotal(totalSecs)
    setSaving(false)
    setStep('reveal')
  }

  async function commitSession(ended_at: string, finalScore: number | null) {
    const ok = await withRetry(
      () => supabase.from('focus_sessions').update({
        status: 'ended', ended_at,
        output_note:    note.trim(),
        focus_score:    finalScore,
        share_to_feed:  share,
      }).eq('id', session.id),
      'Could not save session',
      () => setSaveBanner(true),
    )
    if (ok && userId) {
      void supabase.from('users').update({ active_session_id: null }).eq('id', userId)
    }
  }

  const anyChoice = choices.size > 0

  // ── Render ─────────────────────────────────────────────────────
  const modal = (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)',
    }}
      onClick={e => { if (e.target === e.currentTarget && step === 'note') onCancel() }}
    >
      <div style={{
        width: step === 'reveal' ? 380 : 480,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 16,
        padding: 32,
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        transition: 'width 200ms',
      }}
        onClick={e => e.stopPropagation()}
      >
        {saveBanner && (
          <div style={{
            marginBottom: 12, padding: '8px 12px',
            background: 'rgba(217,92,92,0.12)',
            border: '1px solid rgba(217,92,92,0.3)',
            borderRadius: 8, fontSize: 12, color: 'var(--danger)',
          }}>
            Session may not have saved. Check your connection.
          </div>
        )}

        {/* ── Step 1: Output note ── */}
        {step === 'note' && (
          <>
            <StepIndicator step="note" />
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
              End session
            </h2>
            {/* Summary bar */}
            <div style={{
              display: 'flex', alignItems: 'stretch',
              background: 'var(--bg-surface)', borderRadius: 8, padding: '12px 16px', marginBottom: 20,
            }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3 }}>Session</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {session.name}
                </div>
              </div>
              <div style={{ width: 1, background: 'var(--border-subtle)', margin: '0 16px' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3 }}>Duration</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {formatDuration(Math.max(0, elapsed))}
                </div>
              </div>
              <div style={{ width: 1, background: 'var(--border-subtle)', margin: '0 16px' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3 }}>Est. focus</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: scoreColor(liveScore) }}>
                  {liveScore !== null ? liveScore : '--'}
                </div>
              </div>
            </div>
            {/* Output note */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                What did you accomplish?
              </label>
              <textarea
                ref={textareaRef}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Describe what you completed in this session..."
                rows={3}
                style={{
                  display: 'block', width: '100%', boxSizing: 'border-box', minHeight: 80,
                  background: 'var(--bg-surface)',
                  border: `1px solid ${noteError ? 'var(--danger)' : 'var(--border-default)'}`,
                  borderRadius: 8, padding: '10px 12px',
                  color: 'var(--text-primary)', fontSize: 14,
                  fontFamily: 'var(--font-sans)', resize: 'vertical', outline: 'none',
                }}
              />
              {noteError && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--danger)' }}>{noteError}</p>}
            </div>
            {/* Share toggle */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Share to team feed</span>
                <button
                  onClick={() => setShare(s => !s)}
                  style={{
                    width: 40, height: 22, borderRadius: 11,
                    background: share ? 'var(--accent)' : 'var(--bg-hover)',
                    border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 150ms', flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2, left: share ? 20 : 2,
                    width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left 150ms',
                  }} />
                </button>
              </div>
              {share && <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-tertiary)' }}>Your score and note will be visible to the team</p>}
            </div>
            {/* Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button onClick={onCancel} style={{ padding: '10px 20px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)', borderRadius: 8 }}>
                Cancel
              </button>
              <button
                onClick={handleNoteNext}
                disabled={loadingRows}
                style={{
                  padding: '10px 24px', background: 'var(--accent)', border: 'none', borderRadius: 8,
                  color: 'white', fontSize: 13, fontWeight: 600,
                  cursor: loadingRows ? 'wait' : 'pointer', fontFamily: 'var(--font-sans)',
                  opacity: loadingRows ? 0.7 : 1,
                }}
              >
                {loadingRows ? '...' : 'Next →'}
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: App classification ── */}
        {step === 'classify' && (
          <>
            <StepIndicator step="classify" />
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
              How did you spend this session?
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-tertiary)' }}>
              Mark each app as focused work or a distraction
            </p>

            {hasPrefill && (
              <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--text-tertiary)' }}>
                Pre-filled based on app type or your history — adjust if needed
              </p>
            )}

            {rows.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                No app activity recorded for this session
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, maxHeight: 320, overflowY: 'auto' }}>
                {rows.map(row => {
                  const chosen = choices.get(row.key) ?? null
                  const isUsual = usualSources.has(row.key)
                  return (
                    <div key={row.key} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 8,
                      background: chosen ? 'var(--bg-surface)' : 'transparent',
                    }}>
                      {/* App icon placeholder */}
                      <div style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: 'var(--bg-hover)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0,
                        fontWeight: 500,
                      }}>
                        {row.displayName.charAt(0).toUpperCase()}
                      </div>
                      {/* Name + duration */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.displayName}
                          {isUsual && (
                            <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-tertiary)' }}>Your usual</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          {formatDuration(row.durationSeconds)}
                        </div>
                      </div>
                      {/* Toggle buttons */}
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <ClassifyBtn
                          label="Focused" icon="✓"
                          selected={chosen === 'focused'}
                          color="success"
                          onSelect={() => setChoices(m => {
                            const n = new Map(m)
                            n.set(row.key, 'focused')
                            return n
                          })}
                        />
                        <ClassifyBtn
                          label="Distraction" icon="✗"
                          selected={chosen === 'distraction'}
                          color="danger"
                          onSelect={() => setChoices(m => {
                            const n = new Map(m)
                            n.set(row.key, 'distraction')
                            return n
                          })}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Skip link */}
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <button
                onClick={handleSkip}
                disabled={saving}
                style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
              >
                Skip classification (use estimated score)
              </button>
            </div>

            {/* Calculate button */}
            <button
              onClick={handleCalculate}
              disabled={!anyChoice || saving}
              style={{
                display: 'block', width: '100%', padding: '12px',
                background: anyChoice && !saving ? 'var(--accent)' : 'var(--bg-hover)',
                border: 'none', borderRadius: 8,
                color: anyChoice && !saving ? 'white' : 'var(--text-tertiary)',
                fontSize: 14, fontWeight: 600, cursor: anyChoice && !saving ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-sans)', transition: 'all 150ms',
              }}
            >
              {saving ? '...' : 'Calculate my score →'}
            </button>
          </>
        )}

        {/* ── Step 3: Score reveal ── */}
        {step === 'reveal' && (
          <div style={{ textAlign: 'center' }}>
            {/* Large score */}
            <div style={{
              fontSize: 64, fontWeight: 600, lineHeight: 1,
              color: scoreColor(revealScore),
              marginBottom: 8,
            }}>
              {revealScore !== null ? revealScore : '--'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>
              {revealScore !== null ? scoreLabel(revealScore) : 'Session complete'}
            </div>
            {revealTotal > 0 && revealScore !== null && (
              <>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  You spent {Math.round(scoreFocusRatio([
                    ...Array(revealFocused > 0 ? 1 : 0).fill({ classification: 'focused', duration_seconds: revealFocused }),
                    ...Array(revealDistraction > 0 ? 1 : 0).fill({ classification: 'distraction', duration_seconds: revealDistraction }),
                  ] as { classification: 'focused' | 'distraction'; duration_seconds: number }[]) * 100)}% of tracked time in focused apps
                </div>
                {/* Breakdown bar */}
                <div style={{
                  height: 8, borderRadius: 4, overflow: 'hidden',
                  display: 'flex', marginBottom: 8, background: 'var(--bg-hover)',
                }}>
                  {revealTotal > 0 && (
                    <>
                      <div style={{ width: `${(revealFocused / revealTotal) * 100}%`, background: 'var(--success)' }} />
                      <div style={{ width: `${(revealDistraction / revealTotal) * 100}%`, background: 'var(--danger)' }} />
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 24 }}>
                  <span>
                    <span style={{ color: 'var(--success)' }}>●</span> {formatDuration(revealFocused)} focused
                  </span>
                  {revealDistraction > 0 && (
                    <span>
                      <span style={{ color: 'var(--danger)' }}>●</span> {formatDuration(revealDistraction)} distraction
                    </span>
                  )}
                </div>
              </>
            )}
            <button
              onClick={() => onDone(revealScore)}
              disabled={!doneEnabled}
              style={{
                display: 'block', width: '100%', padding: '12px',
                background: doneEnabled ? 'var(--accent)' : 'var(--bg-hover)',
                border: 'none', borderRadius: 8,
                color: doneEnabled ? 'white' : 'var(--text-tertiary)',
                fontSize: 14, fontWeight: 600,
                cursor: doneEnabled ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-sans)', transition: 'all 300ms',
              }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return modal
}

// ── Main component ────────────────────────────────────────────────

export function SessionTopBar() {
  const session       = useSessionStore(s => s.activeSession)
  const liveScore     = useSessionStore(s => s.liveScore)
  const clearSession  = useSessionStore(s => s.clearSession)
  const updateSession = useSessionStore(s => s.updateSession)
  const setLiveScore  = useSessionStore(s => s.setLiveScore)
  const user          = useAuthStore(s => s.user)

  const [elapsed,     setElapsed]     = useState(0)
  const [showEnd,     setShowEnd]     = useState(false)
  const [saveBanner,  setSaveBanner]  = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput,   setNameInput]   = useState('')
  const [showCapture, setShowCapture] = useState(false)
  const [captureRect, setCaptureRect] = useState<DOMRect | null>(null)

  const captureButtonRef = useRef<HTMLButtonElement>(null)

  // ── Timer ─────────────────────────────────────────────────────
  useEffect(() => {
    const s = useSessionStore.getState().activeSession
    if (!s) return
    if (s.status === 'paused') { setElapsed(computeElapsed(s)); return }
    setElapsed(computeElapsed(s))
    const t = setInterval(() => {
      const curr = useSessionStore.getState().activeSession
      if (curr) setElapsed(computeElapsed(curr))
    }, 1000)
    return () => clearInterval(t)
  }, [session?.status, session?.paused_at, session?.total_pause_seconds, session?.started_at])

  // ── Live score every 60 s ─────────────────────────────────────
  useEffect(() => {
    const s = useSessionStore.getState().activeSession
    if (!s || s.status === 'paused') return
    const t = setInterval(() => {
      const curr = useSessionStore.getState().activeSession
      if (!curr) return
      void (async () => {
        const { data } = await supabase.from('activity_events').select('*').eq('session_id', curr.id)
        const events = (data ?? []) as DBActivityEvent[]
        setLiveScore(computeLiveScore({ session: curr, activityEvents: events }))
      })()
    }, 60_000)
    return () => clearInterval(t)
  }, [session?.status, setLiveScore])

  // ── Global keyboard shortcuts ─────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const sess = useSessionStore.getState().activeSession
      if (!sess) return
      if (e.metaKey && !e.shiftKey && e.key === 'k') {
        e.preventDefault()
        const rect = captureButtonRef.current?.getBoundingClientRect() ?? null
        setCaptureRect(rect)
        setShowCapture(v => !v)
        return
      }
      if (e.metaKey && e.shiftKey && e.key === 'P') {
        e.preventDefault()
        void (async () => {
          if (sess.status === 'paused') await resumeSession(sess)
          else                          await pauseSession(sess)
        })()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!session || session.status === 'ended') return null

  const isPaused = session.status === 'paused'

  // ── Session write helpers ─────────────────────────────────────
  async function pauseSession(sess: DBFocusSession) {
    const paused_at = new Date().toISOString()
    const ok = await withRetry(
      () => supabase.from('focus_sessions').update({ status: 'paused', paused_at }).eq('id', sess.id),
      'Could not pause session', () => setSaveBanner(true),
    )
    if (ok) updateSession({ status: 'paused', paused_at })
  }

  async function resumeSession(sess: DBFocusSession) {
    if (!sess.paused_at) return
    const now   = new Date()
    const delta = Math.floor((now.getTime() - new Date(sess.paused_at).getTime()) / 1000)
    const total_pause_seconds = sess.total_pause_seconds + delta
    const ok = await withRetry(
      () => supabase.from('focus_sessions').update({ status: 'active', paused_at: null, total_pause_seconds }).eq('id', sess.id),
      'Could not resume session', () => setSaveBanner(true),
    )
    if (ok) updateSession({ status: 'active', paused_at: null, total_pause_seconds })
  }

  async function handlePause()  { await pauseSession(session!) }
  async function handleResume() { await resumeSession(session!) }

  function handleDone(finalScore: number | null) {
    setShowEnd(false)
    clearSession()
    const msg = finalScore !== null ? `Session ended · Focus score: ${finalScore}` : 'Session ended'
    const type = finalScore === null ? 'info' : finalScore >= 70 ? 'success' : finalScore >= 50 ? 'info' : 'error'
    toast(msg, type)
  }

  function startEditName() {
    setNameInput(session!.name)
    setEditingName(true)
  }

  async function saveNameEdit() {
    const trimmed = nameInput.trim()
    setEditingName(false)
    if (!trimmed || trimmed === session!.name) return
    const { error } = await supabase.from('focus_sessions').update({ name: trimmed }).eq('id', session!.id)
    if (error) toast('Could not save session name', 'error')
    else       updateSession({ name: trimmed })
  }

  function openCapture() {
    setCaptureRect(captureButtonRef.current?.getBoundingClientRect() ?? null)
    setShowCapture(v => !v)
  }

  return (
    <>
      {saveBanner && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '5px 24px', background: 'rgba(217,92,92,0.12)',
          borderBottom: '1px solid rgba(217,92,92,0.3)', fontSize: 12, color: 'var(--danger)', flexShrink: 0,
        }}>
          <span>Session data may not have saved. Check your connection.</span>
          <button onClick={() => setSaveBanner(false)} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Dismiss</button>
        </div>
      )}

      <div style={{
        height: 48, width: '100%', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 24, padding: '0 24px', boxSizing: 'border-box',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid rgba(124,111,224,0.2)',
        borderLeft: isPaused ? '3px solid var(--warning)' : 'none',
        zIndex: 100,
      }}>
        {/* Pulse dot + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div className={isPaused ? 'session-dot session-dot--paused' : 'session-dot session-dot--active'}
            style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
          {editingName ? (
            <input autoFocus value={nameInput} onChange={e => setNameInput(e.target.value)}
              onBlur={saveNameEdit}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingName(false) }}
              style={{ maxWidth: 200, minWidth: 80, background: 'transparent', border: 'none', borderBottom: '1px solid var(--accent)', outline: 'none', color: 'var(--text-primary)', fontSize: 14, fontWeight: 500, fontFamily: 'var(--font-sans)', padding: '0 2px' }} />
          ) : (
            <span onClick={startEditName} title="Click to rename" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', cursor: 'text' }}>
              {session.name}
            </span>
          )}
        </div>

        {/* Timer */}
        <span style={{ fontSize: 16, fontWeight: 600, color: isPaused ? 'var(--text-tertiary)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em', flexShrink: 0 }}>
          {formatTimer(elapsed)}
        </span>

        {/* Live score with "estimated" label */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Focus</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: scoreColor(liveScore) }}>
              {liveScore !== null ? liveScore : '--'}
            </span>
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1 }}>estimated</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Quick capture */}
        <button ref={captureButtonRef} onClick={openCapture} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)', padding: '4px 8px', borderRadius: 6, flexShrink: 0 }}>
          Capture
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'inherit' }}>⌘K</span>
        </button>

        {/* Pause / Resume */}
        {isPaused ? (
          <button onClick={handleResume} style={{ padding: '4px 14px', background: 'var(--accent-subtle)', border: '1px solid var(--accent)', borderRadius: 6, color: 'var(--accent)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>Resume</button>
        ) : (
          <button onClick={handlePause} style={{ padding: '4px 14px', background: 'none', border: '1px solid var(--border-default)', borderRadius: 6, color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>Pause</button>
        )}

        {/* End session */}
        <button
          onClick={() => setShowEnd(true)}
          style={{ padding: '4px 14px', background: 'none', border: '1px solid rgba(217,92,92,0.25)', borderRadius: 6, color: 'var(--danger)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)', flexShrink: 0, transition: 'background 150ms' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(217,92,92,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          End session
        </button>
      </div>

      <QuickCapturePopover open={showCapture} onClose={() => setShowCapture(false)} anchorRect={captureRect} />

      {showEnd && (
        <EndSessionModal
          session={session}
          elapsed={elapsed}
          liveScore={liveScore}
          userId={user?.id}
          onDone={handleDone}
          onCancel={() => setShowEnd(false)}
        />
      )}
    </>
  )
}
