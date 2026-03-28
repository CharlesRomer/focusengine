import { useState } from 'react'
import { ProofUpload } from '@/components/commitments/ProofUpload'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useMarkDone, useMarkIncomplete, useReopenCommitment } from '@/hooks/useCommitments'
import type { DBCommitment } from '@/lib/supabase'

type PulseCommitment = Pick<
  DBCommitment,
  'id' | 'user_id' | 'text' | 'status' | 'proof_url' | 'incomplete_reason' | 'deleted_at'
>

interface Props {
  commitment: PulseCommitment
  isOwn: boolean
}

export function PulseCommitmentItem({ commitment, isOwn }: Props) {
  const [showProof, setShowProof] = useState(false)
  const [showIncomplete, setShowIncomplete] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')

  const markDone = useMarkDone()
  const markIncomplete = useMarkIncomplete()
  const reopen = useReopenCommitment()

  // Soft-deleted commitments render as incomplete
  const isDeleted = !!commitment.deleted_at
  const status = isDeleted ? 'incomplete' : commitment.status
  const isDone = status === 'done'
  const isIncomplete = status === 'incomplete'
  const isOpen = status === 'open'

  function handleMarkIncomplete() {
    setReasonError('')
    if (!reason.trim()) { setReasonError('A reason is required'); return }
    markIncomplete.mutate({ id: commitment.id, reason: reason.trim() })
    setShowIncomplete(false)
    setReason('')
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          padding: '5px 0',
        }}
      >
        {/* Status indicator */}
        <button
          onClick={() => { if (isOwn && isOpen) setShowProof(true) }}
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: isDone
              ? 'none'
              : isIncomplete
              ? '1.5px solid var(--danger)'
              : '1.5px solid var(--border-default)',
            background: isDone ? 'var(--success)' : 'transparent',
            flexShrink: 0,
            marginTop: 2,
            cursor: isOwn && isOpen ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          {isDone && (
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {isIncomplete && (
            <div style={{ width: 6, height: 1.5, background: 'var(--danger)', borderRadius: 1 }} />
          )}
        </button>

        {/* Text + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              lineHeight: '18px',
              color: isDone
                ? 'var(--text-tertiary)'
                : isIncomplete
                ? 'var(--text-tertiary)'
                : 'var(--text-primary)',
              textDecoration: isDone ? 'line-through' : 'none',
              wordBreak: 'break-word',
            }}
          >
            {commitment.text}
          </div>

          {/* Proof thumbnail */}
          {isDone && commitment.proof_url && (
            <a
              href={commitment.proof_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                marginTop: 4,
                width: 28,
                height: 28,
                borderRadius: 4,
                overflow: 'hidden',
                border: '1px solid var(--border-subtle)',
                flexShrink: 0,
              }}
            >
              <img
                src={commitment.proof_url}
                alt="proof"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => {
                  // If not an image, show a link icon
                  const el = e.currentTarget as HTMLImageElement
                  el.style.display = 'none'
                  el.parentElement!.innerHTML =
                    '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--accent)">↗</div>'
                }}
              />
            </a>
          )}

          {/* Incomplete reason */}
          {isIncomplete && commitment.incomplete_reason && !isDeleted && (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, fontStyle: 'italic' }}>
              "{commitment.incomplete_reason}"
            </div>
          )}
        </div>

        {/* Own-only inline actions */}
        {isOwn && isOpen && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button
              onClick={() => setShowProof(true)}
              style={{
                fontSize: 11,
                color: 'var(--success)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '1px 4px',
                borderRadius: 3,
              }}
            >
              Done
            </button>
            <button
              onClick={() => setShowIncomplete(true)}
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '1px 4px',
                borderRadius: 3,
              }}
            >
              Skip
            </button>
          </div>
        )}
        {isOwn && !isOpen && (
          <button
            onClick={() => reopen.mutate(commitment.id)}
            style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '1px 4px',
              borderRadius: 3,
              flexShrink: 0,
            }}
          >
            Reopen
          </button>
        )}
      </div>

      {/* Proof upload sheet */}
      <ProofUpload
        open={showProof}
        onClose={() => setShowProof(false)}
        commitmentText={commitment.text}
        onConfirm={(url, type) => { markDone.mutate({ id: commitment.id, proofUrl: url, proofType: type }); setShowProof(false) }}
        onSkip={() => { markDone.mutate({ id: commitment.id }); setShowProof(false) }}
      />

      {/* Mark incomplete modal */}
      <Modal open={showIncomplete} onClose={() => setShowIncomplete(false)} title="Mark as incomplete">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: -8 }}>
            "{commitment.text}"
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 500 }}>
              What got in the way? (required)
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleMarkIncomplete()}
              placeholder="Briefly describe the reason..."
              autoFocus
              style={{
                height: 36,
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-base)',
                border: `1px solid ${reasonError ? 'var(--danger)' : 'var(--border-default)'}`,
                padding: '0 12px',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            {reasonError && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)' }}>{reasonError}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowIncomplete(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleMarkIncomplete} loading={markIncomplete.isPending}>
              Mark incomplete
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
