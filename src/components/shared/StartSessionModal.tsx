import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { useAuthStore } from '@/store/auth'
import { useSessionStore } from '@/store/session'
import { supabase, type DBFocusBlock, type DBFocusSession, type DBCommitment } from '@/lib/supabase'
import { toast } from '@/store/ui'

interface Props {
  open: boolean
  onClose: () => void
}

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hh = h % 12 || 12
  return `${hh}:${String(m).padStart(2, '0')}${ampm}`
}

export function StartSessionModal({ open, onClose }: Props) {
  const user      = useAuthStore(s => s.user)
  const setActive = useSessionStore(s => s.setActiveSession)

  const [step,             setStep]             = useState<'loading' | 'picker' | 'new' | 'plan-check'>('loading')
  const [blocks,           setBlocks]           = useState<DBFocusBlock[]>([])
  const [selectedId,       setSelectedId]       = useState<string | null>(null)
  const [name,             setName]             = useState('')
  const [isStarting,       setIsStarting]       = useState(false)

  // plan-check step state
  const [pendingName,          setPendingName]          = useState('')
  const [pendingBlockId,       setPendingBlockId]       = useState<string | null>(null)
  const [showCommitPicker,     setShowCommitPicker]     = useState(false)
  const [todayCommitments,     setTodayCommitments]     = useState<DBCommitment[]>([])
  const [selectedCommitmentId, setSelectedCommitmentId] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  // On open: fetch today's unlinked focus_blocks
  useEffect(() => {
    if (!open || !user) return
    setStep('loading')
    setSelectedId(null)
    setName('')
    setIsStarting(false)
    setPendingName('')
    setPendingBlockId(null)
    setShowCommitPicker(false)
    setSelectedCommitmentId(null)

    const today = format(new Date(), 'yyyy-MM-dd')
    supabase
      .from('focus_blocks')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .is('session_id', null)
      .is('deleted_at', null)
      .order('start_time')
      .then(({ data }) => {
        const list = (data ?? []) as DBFocusBlock[]
        setBlocks(list)
        setStep(list.length === 0 ? 'new' : 'picker')
      })
  }, [open, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus input when step becomes 'new'
  useEffect(() => {
    if (step === 'new') setTimeout(() => inputRef.current?.focus(), 50)
  }, [step])

  // Escape closes (only on note/picker/new steps — plan-check uses Escape to start-as-planned)
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (step === 'plan-check') {
        // Escape = "Yes, it's planned" implicitly → start with is_unplanned=false
        void startSession(pendingName, pendingBlockId, false, null)
      } else {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, step, pendingName, pendingBlockId, onClose]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  // ── Core session start ─────────────────────────────────────────
  async function startSession(
    sessionName: string,
    blockId: string | null,
    isUnplanned: boolean,
    commitmentId: string | null,
  ) {
    if (!user || isStarting) return
    setIsStarting(true)

    const { data: existing } = await supabase
      .from('focus_sessions')
      .select('id')
      .eq('user_id', user.id)
      .in('status', ['active', 'paused'])
      .limit(1)
      .maybeSingle()

    if (existing) {
      toast('You already have an active session. End it before starting a new one.', 'error')
      setIsStarting(false)
      onClose()
      return
    }

    const { data, error } = await supabase
      .from('focus_sessions')
      .insert({
        user_id:             user.id,
        team_org_id:         user.team_org_id ?? '',
        name:                sessionName,
        status:              'active',
        total_pause_seconds: 0,
        share_to_feed:       false,
        is_unplanned:        isUnplanned,
      })
      .select()
      .single()

    if (error) { toast('Could not start session', 'error'); setIsStarting(false); return }

    const session = data as DBFocusSession

    // Link block → session
    if (blockId) {
      await supabase.from('focus_blocks').update({ session_id: session.id }).eq('id', blockId)
    }

    // If user picked a commitment in plan-check, create a focus_block linking them
    if (commitmentId && !blockId) {
      await supabase.from('focus_blocks').insert({
        user_id:       user.id,
        name:          sessionName,
        date:          format(new Date(), 'yyyy-MM-dd'),
        start_time:    '00:00',
        end_time:      '00:00',
        commitment_id: commitmentId,
        session_id:    session.id,
      })
    }

    await supabase.from('users').update({ active_session_id: session.id }).eq('id', user.id)

    setActive(session)
    toast('Session started — stay focused', 'success')
    onClose()
  }

  // ── Entry points from picker/new steps ────────────────────────
  async function handlePickerConfirm() {
    if (!selectedId) return
    const block = blocks.find(b => b.id === selectedId)
    if (!block) return
    // Block has commitment_id → planned; no plan-check needed
    if (block.commitment_id) {
      await startSession(block.name, block.id, false, null)
    } else {
      // Block exists but no commitment — show plan-check
      setPendingName(block.name)
      setPendingBlockId(block.id)
      await loadTodayCommitments()
      setStep('plan-check')
    }
  }

  async function handleNewConfirm() {
    const trimmed = name.trim()
    if (!trimmed) return
    setPendingName(trimmed)
    setPendingBlockId(null)
    await loadTodayCommitments()
    setStep('plan-check')
  }

  async function loadTodayCommitments() {
    if (!user) return
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('commitments')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .eq('status', 'open')
      .is('deleted_at', null)
      .order('created_at')
    setTodayCommitments((data ?? []) as DBCommitment[])
  }

  // ── plan-check actions ─────────────────────────────────────────
  async function handlePlanCheckNo() {
    await startSession(pendingName, pendingBlockId, true, null)
  }

  async function handlePlanCheckYes() {
    if (todayCommitments.length === 0) {
      // No commitments to link — start as planned anyway
      await startSession(pendingName, pendingBlockId, false, null)
      return
    }
    setShowCommitPicker(true)
  }

  async function handlePlanCheckWithCommitment() {
    await startSession(pendingName, pendingBlockId, false, selectedCommitmentId)
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        zIndex: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
      }}
      onClick={e => { if (e.target === e.currentTarget && step !== 'plan-check') onClose() }}
    >
      <div
        style={{
          width: 440,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 16,
          padding: '28px 28px 24px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Loading */}
        {step === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-tertiary)', fontSize: 13 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--border-default)', borderTopColor: 'var(--accent)', animation: 'spin 0.6s linear infinite' }} />
            Loading...
          </div>
        )}

        {/* Block picker */}
        {step === 'picker' && (
          <>
            <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              Start a focus session
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-tertiary)' }}>
              Pick a block from your schedule, or start something new.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {blocks.map(block => {
                const selected = block.id === selectedId
                return (
                  <button
                    key={block.id}
                    onClick={() => setSelectedId(block.id)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                      padding: '10px 12px',
                      background: selected ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                      border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-default)'}`,
                      borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                      fontFamily: 'var(--font-sans)', transition: 'background 120ms, border-color 120ms',
                    }}
                    onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--bg-hover)' }}
                    onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'var(--bg-surface)' }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                      {block.name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {fmtTime(block.start_time)} – {fmtTime(block.end_time)}
                    </span>
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setStep('new')}
              style={{
                background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 12,
                cursor: 'pointer', fontFamily: 'var(--font-sans)', padding: '2px 0', marginBottom: 20,
                textDecoration: 'underline',
              }}
            >
              or start something new
            </button>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
              <button
                onClick={() => void handlePickerConfirm()}
                disabled={!selectedId || isStarting}
                style={primaryBtnStyle(!selectedId || isStarting)}
              >
                {isStarting ? '...' : 'Start session'}
              </button>
            </div>
          </>
        )}

        {/* New session name input */}
        {step === 'new' && (
          <>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              What are you working on?
            </h2>

            <input
              ref={inputRef}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleNewConfirm() }}
              placeholder="Name this session..."
              style={{
                display: 'block', width: '100%', boxSizing: 'border-box',
                background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)',
                fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none', marginBottom: 20,
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--border-strong)' }}
              onBlur={e => { e.target.style.borderColor = 'var(--border-default)' }}
            />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              {blocks.length > 0 && (
                <button
                  onClick={() => setStep('picker')}
                  style={{ ...cancelBtnStyle, marginRight: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}
                >
                  ← Back
                </button>
              )}
              <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
              <button
                onClick={() => void handleNewConfirm()}
                disabled={!name.trim() || isStarting}
                style={primaryBtnStyle(!name.trim() || isStarting)}
              >
                {isStarting ? '...' : 'Next →'}
              </button>
            </div>
          </>
        )}

        {/* Plan-check step */}
        {step === 'plan-check' && (
          <>
            <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              Is this in your commitments?
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--text-tertiary)' }}>
              "{pendingName}"
            </p>

            {!showCommitPicker ? (
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <button
                  onClick={() => void handlePlanCheckYes()}
                  disabled={isStarting}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 500,
                    background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                    color: 'var(--text-secondary)', cursor: isStarting ? 'wait' : 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  Yes, it's planned
                </button>
                <button
                  onClick={() => void handlePlanCheckNo()}
                  disabled={isStarting}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13,
                    background: 'none', border: '1px solid var(--border-subtle)',
                    color: 'var(--text-tertiary)', cursor: isStarting ? 'wait' : 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {isStarting ? '...' : 'No, this came up ⚡'}
                </button>
              </div>
            ) : (
              <>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-secondary)' }}>
                  Which commitment is this related to?
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, maxHeight: 200, overflowY: 'auto' }}>
                  {todayCommitments.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No open commitments today.</p>
                  ) : todayCommitments.map(c => {
                    const sel = c.id === selectedCommitmentId
                    return (
                      <button
                        key={c.id}
                        onClick={() => setSelectedCommitmentId(c.id)}
                        style={{
                          padding: '8px 12px', textAlign: 'left', borderRadius: 8,
                          background: sel ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                          border: `1px solid ${sel ? 'var(--accent)' : 'var(--border-default)'}`,
                          color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer',
                          fontFamily: 'var(--font-sans)',
                        }}
                      >
                        {c.text}
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setShowCommitPicker(false)}
                    style={cancelBtnStyle}
                  >← Back</button>
                  <button
                    onClick={() => void handlePlanCheckWithCommitment()}
                    disabled={isStarting}
                    style={primaryBtnStyle(isStarting)}
                  >
                    {isStarting ? '...' : 'Start session'}
                  </button>
                </div>
              </>
            )}

            {!showCommitPicker && (
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', margin: 0 }}>
                Press Esc to start without tagging
              </p>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'transparent', border: 'none',
  color: 'var(--text-secondary)', fontSize: 13,
  cursor: 'pointer', fontFamily: 'var(--font-sans)',
  borderRadius: 8,
}

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 20px',
    background: disabled ? 'var(--bg-hover)' : 'var(--accent)',
    border: 'none', borderRadius: 8,
    color: disabled ? 'var(--text-tertiary)' : 'white',
    fontSize: 13, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font-sans)',
    transition: 'background 150ms',
  }
}
