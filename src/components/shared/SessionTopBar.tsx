import { useState, useEffect, useRef } from 'react'
import { useSessionStore } from '@/store/session'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import type { DBFocusSession, DBActivityEvent } from '@/lib/supabase'
import { toast } from '@/store/ui'
import { computeFocusScore } from '@/lib/scoring'
import { QuickCapturePopover } from './QuickCapturePopover'

async function fetchActivityEvents(sessionId: string): Promise<DBActivityEvent[]> {
  const { data } = await supabase
    .from('activity_events')
    .select('*')
    .eq('session_id', sessionId)
  return (data ?? []) as DBActivityEvent[]
}

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

function formatDuration(secs: number): string {
  const h = Math.floor(Math.max(0, secs) / 3600)
  const m = Math.floor((Math.max(0, secs) % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0)           return `${h}h`
  if (m > 0)           return `${m}m`
  return '<1m'
}

function scoreColor(score: number | null): string {
  if (score === null) return 'var(--text-tertiary)'
  if (score >= 70)    return 'var(--success)'
  if (score >= 50)    return 'var(--warning)'
  return 'var(--danger)'
}

/** Write to Supabase, retry once after 2 s. Returns true on success. */
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

// ── End-session modal ─────────────────────────────────────────────

interface EndModalProps {
  session: DBFocusSession
  elapsed: number
  liveScore: number | null
  isEnding: boolean
  onConfirm: (note: string, share: boolean) => void
  onCancel: () => void
}

function EndSessionModal({ session, elapsed, liveScore, isEnding, onConfirm, onCancel }: EndModalProps) {
  const [note,      setNote]      = useState('')
  const [share,     setShare]     = useState(false)
  const [noteError, setNoteError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 50)
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  function handleConfirm() {
    setNoteError('')
    if (note.trim().length < 10) {
      setNoteError('Please describe what you accomplished (at least 10 characters)')
      return
    }
    onConfirm(note.trim(), share)
  }

  const scoreDisplay = liveScore !== null ? String(liveScore) : '--'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        style={{
          width: 440,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 16,
          padding: 32,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
          End session
        </h2>

        {/* Summary bar */}
        <div style={{
          display: 'flex', alignItems: 'stretch',
          background: 'var(--bg-surface)',
          borderRadius: 8, padding: '12px 16px',
          marginBottom: 20,
        }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3 }}>Session</div>
            <div style={{
              fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {session.name}
            </div>
          </div>
          <div style={{ width: 1, background: 'var(--border-subtle)', margin: '0 16px', alignSelf: 'stretch' }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3 }}>Duration</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {formatDuration(elapsed)}
            </div>
          </div>
          <div style={{ width: 1, background: 'var(--border-subtle)', margin: '0 16px', alignSelf: 'stretch' }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3 }}>Focus</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: scoreColor(liveScore) }}>
              {scoreDisplay}
            </div>
          </div>
        </div>

        {/* Output note */}
        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: 'block', fontSize: 13, fontWeight: 500,
            color: 'var(--text-secondary)', marginBottom: 6,
          }}>
            What did you accomplish?
          </label>
          <textarea
            ref={textareaRef}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Describe what you completed in this session..."
            rows={3}
            style={{
              display: 'block', width: '100%', boxSizing: 'border-box',
              minHeight: 80,
              background: 'var(--bg-surface)',
              border: `1px solid ${noteError ? 'var(--danger)' : 'var(--border-default)'}`,
              borderRadius: 8,
              padding: '10px 12px',
              color: 'var(--text-primary)',
              fontSize: 14,
              fontFamily: 'var(--font-sans)',
              resize: 'vertical',
              outline: 'none',
            }}
          />
          {noteError && (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--danger)' }}>{noteError}</p>
          )}
        </div>

        {/* Share toggle */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Share to team feed</span>
            <button
              onClick={() => setShare(s => !s)}
              aria-label="Toggle share to feed"
              style={{
                width: 40, height: 22, borderRadius: 11,
                background: share ? 'var(--accent)' : 'var(--bg-hover)',
                border: 'none', cursor: 'pointer',
                position: 'relative', transition: 'background 150ms',
                flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute',
                top: 2, left: share ? 20 : 2,
                width: 18, height: 18,
                borderRadius: '50%',
                background: 'white',
                transition: 'left 150ms',
              }} />
            </button>
          </div>
          {share && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-tertiary)' }}>
              Your score and note will be visible to the team
            </p>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              background: 'transparent', border: 'none',
              color: 'var(--text-secondary)', fontSize: 13,
              cursor: 'pointer', fontFamily: 'var(--font-sans)', borderRadius: 8,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isEnding}
            style={{
              padding: '10px 24px',
              background: 'var(--accent)',
              border: 'none', borderRadius: 8,
              color: 'white', fontSize: 13, fontWeight: 600,
              cursor: isEnding ? 'wait' : 'pointer',
              fontFamily: 'var(--font-sans)',
              opacity: isEnding ? 0.7 : 1,
              transition: 'opacity 150ms',
            }}
          >
            {isEnding ? '...' : 'End session'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────

export function SessionTopBar() {
  // Store
  const session       = useSessionStore(s => s.activeSession)
  const liveScore     = useSessionStore(s => s.liveScore)
  const clearSession  = useSessionStore(s => s.clearSession)
  const updateSession = useSessionStore(s => s.updateSession)
  const setLiveScore  = useSessionStore(s => s.setLiveScore)
  const user          = useAuthStore(s => s.user)

  // Local UI state
  const [elapsed,      setElapsed]      = useState(0)
  const [showEnd,      setShowEnd]      = useState(false)
  const [isEnding,     setIsEnding]     = useState(false)
  const [showCapture,  setShowCapture]  = useState(false)
  const [captureRect,  setCaptureRect]  = useState<DOMRect | null>(null)
  const [saveBanner,   setSaveBanner]   = useState(false)
  const [editingName,  setEditingName]  = useState(false)
  const [nameInput,    setNameInput]    = useState('')

  const captureButtonRef = useRef<HTMLButtonElement>(null)

  // ── Timer — runs unconditionally ──────────────────────────
  useEffect(() => {
    const s = useSessionStore.getState().activeSession
    if (!s) return
    if (s.status === 'paused') {
      setElapsed(computeElapsed(s))
      return
    }
    setElapsed(computeElapsed(s))
    const t = setInterval(() => {
      const curr = useSessionStore.getState().activeSession
      if (curr) setElapsed(computeElapsed(curr))
    }, 1000)
    return () => clearInterval(t)
  }, [session?.status, session?.paused_at, session?.total_pause_seconds, session?.started_at])

  // ── Live score every 60 s (real activity data) ────────────
  useEffect(() => {
    const s = useSessionStore.getState().activeSession
    if (!s || s.status === 'paused') return
    const t = setInterval(() => {
      const curr = useSessionStore.getState().activeSession
      if (!curr) return
      void fetchActivityEvents(curr.id).then(events => {
        setLiveScore(computeFocusScore({ session: curr, activityEvents: events }))
      })
    }, 60_000)
    return () => clearInterval(t)
  }, [session?.status, setLiveScore])

  // ── Global keyboard shortcuts ─────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const sess = useSessionStore.getState().activeSession
      if (!sess) return

      // ⌘K — quick capture
      if (e.metaKey && !e.shiftKey && e.key === 'k') {
        e.preventDefault()
        const rect = captureButtonRef.current?.getBoundingClientRect() ?? null
        setCaptureRect(rect)
        setShowCapture(v => !v)
        return
      }

      // ⌘⇧P — pause / resume (fire-and-forget async inside sync handler)
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
  }, []) // reads fresh store state inside handler

  // ── Early exit when no active session ────────────────────
  if (!session || session.status === 'ended') return null

  const isPaused = session.status === 'paused'

  // ── Session write helpers ─────────────────────────────────
  async function pauseSession(sess: DBFocusSession) {
    const paused_at = new Date().toISOString()
    const ok = await withRetry(
      () => supabase.from('focus_sessions').update({ status: 'paused', paused_at }).eq('id', sess.id),
      'Could not pause session',
      () => setSaveBanner(true),
    )
    if (ok) updateSession({ status: 'paused', paused_at })
  }

  async function resumeSession(sess: DBFocusSession) {
    if (!sess.paused_at) return
    const now   = new Date()
    const delta = Math.floor((now.getTime() - new Date(sess.paused_at).getTime()) / 1000)
    const total_pause_seconds = sess.total_pause_seconds + delta
    const ok = await withRetry(
      () => supabase.from('focus_sessions')
        .update({ status: 'active', paused_at: null, total_pause_seconds })
        .eq('id', sess.id),
      'Could not resume session',
      () => setSaveBanner(true),
    )
    if (ok) updateSession({ status: 'active', paused_at: null, total_pause_seconds })
  }

  // session is non-null past the early return — use session! to satisfy TS
  async function handlePause()  { await pauseSession(session!) }
  async function handleResume() { await resumeSession(session!) }

  async function handleEnd(note: string, share: boolean) {
    setIsEnding(true)
    const s      = session!
    const userId = user?.id

    // Fetch real activity data for final score
    const events     = await fetchActivityEvents(s.id)
    const ended_at   = new Date().toISOString()
    const finalScore = computeFocusScore({ session: s, activityEvents: events })

    const ok = await withRetry(
      () => supabase.from('focus_sessions').update({
        status: 'ended', ended_at,
        output_note: note,
        focus_score: finalScore,
        share_to_feed: share,
      }).eq('id', s.id),
      'Could not end session',
      () => setSaveBanner(true),
    )
    setIsEnding(false)
    if (!ok) return

    // Clear active_session_id on user record (best-effort)
    if (userId) {
      void supabase.from('users').update({ active_session_id: null }).eq('id', userId)
    }

    setShowEnd(false)
    clearSession()

    const scoreMsg = finalScore !== null
      ? `Session ended · Focus score: ${finalScore}`
      : 'Session ended'
    const toastType = finalScore === null ? 'info'
      : finalScore >= 70 ? 'success'
      : finalScore >= 50 ? 'info'
      : 'error'
    toast(scoreMsg, toastType)
  }

  // ── Inline name editing ───────────────────────────────────
  function startEditName() {
    setNameInput(session!.name)
    setEditingName(true)
  }

  async function saveNameEdit() {
    const s       = session!
    const trimmed = nameInput.trim()
    setEditingName(false)
    if (!trimmed || trimmed === s.name) return
    const { error } = await supabase
      .from('focus_sessions')
      .update({ name: trimmed })
      .eq('id', s.id)
    if (error) toast('Could not save session name', 'error')
    else       updateSession({ name: trimmed })
  }

  // ── Capture popover trigger ───────────────────────────────
  function openCapture() {
    setCaptureRect(captureButtonRef.current?.getBoundingClientRect() ?? null)
    setShowCapture(v => !v)
  }

  return (
    <>
      {/* Persistent save-failure banner */}
      {saveBanner && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '5px 24px',
          background: 'rgba(217,92,92,0.12)',
          borderBottom: '1px solid rgba(217,92,92,0.3)',
          fontSize: 12, color: 'var(--danger)',
          flexShrink: 0,
        }}>
          <span>Session data may not have saved. Check your connection.</span>
          <button
            onClick={() => setSaveBanner(false)}
            style={{
              background: 'none', border: 'none',
              color: 'var(--danger)', fontSize: 12,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main 48px bar */}
      <div style={{
        height: 48,
        width: '100%',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: '0 24px',
        boxSizing: 'border-box',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid rgba(124,111,224,0.2)',
        borderLeft: isPaused ? '3px solid var(--warning)' : 'none',
        zIndex: 100,
      }}>

        {/* Left: pulse dot + editable name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div
            className={isPaused ? 'session-dot session-dot--paused' : 'session-dot session-dot--active'}
            style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}
          />
          {editingName ? (
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onBlur={saveNameEdit}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.currentTarget.blur() }
                if (e.key === 'Escape') setEditingName(false)
              }}
              style={{
                maxWidth: 200, minWidth: 80,
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--accent)',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 14, fontWeight: 500,
                fontFamily: 'var(--font-sans)',
                padding: '0 2px',
              }}
            />
          ) : (
            <span
              onClick={startEditName}
              title="Click to rename"
              style={{
                maxWidth: 200,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontSize: 14, fontWeight: 500,
                color: 'var(--text-primary)',
                cursor: 'text',
              }}
            >
              {session.name}
            </span>
          )}
        </div>

        {/* Timer */}
        <span style={{
          fontSize: 16, fontWeight: 600,
          color: isPaused ? 'var(--text-tertiary)' : 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.02em',
          flexShrink: 0,
        }}>
          {formatTimer(elapsed)}
        </span>

        {/* Focus score */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Focus</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: scoreColor(liveScore) }}>
            {liveScore !== null ? liveScore : '--'}
          </span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Quick capture */}
        <button
          ref={captureButtonRef}
          onClick={openCapture}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'none', border: 'none',
            color: 'var(--text-secondary)', fontSize: 13,
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
            padding: '4px 8px', borderRadius: 6,
            flexShrink: 0,
          }}
        >
          Capture
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'inherit' }}>⌘K</span>
        </button>

        {/* Pause / Resume */}
        {isPaused ? (
          <button
            onClick={handleResume}
            style={{
              padding: '4px 14px',
              background: 'var(--accent-subtle)',
              border: '1px solid var(--accent)',
              borderRadius: 6,
              color: 'var(--accent)', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
              flexShrink: 0,
            }}
          >
            Resume
          </button>
        ) : (
          <button
            onClick={handlePause}
            style={{
              padding: '4px 14px',
              background: 'none',
              border: '1px solid var(--border-default)',
              borderRadius: 6,
              color: 'var(--text-secondary)', fontSize: 13,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
              flexShrink: 0,
            }}
          >
            Pause
          </button>
        )}

        {/* End session */}
        <button
          onClick={() => setShowEnd(true)}
          style={{
            padding: '4px 14px',
            background: 'none',
            border: '1px solid rgba(217,92,92,0.25)',
            borderRadius: 6,
            color: 'var(--danger)', fontSize: 13,
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
            flexShrink: 0,
            transition: 'background 150ms',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(217,92,92,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          End session
        </button>
      </div>

      {/* Quick capture popover */}
      <QuickCapturePopover
        open={showCapture}
        onClose={() => setShowCapture(false)}
        anchorRect={captureRect}
      />

      {/* End session modal */}
      {showEnd && (
        <EndSessionModal
          session={session}
          elapsed={elapsed}
          liveScore={liveScore}
          isEnding={isEnding}
          onConfirm={handleEnd}
          onCancel={() => setShowEnd(false)}
        />
      )}
    </>
  )
}
