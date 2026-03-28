import { useState, useEffect, useRef } from 'react'
import { type DBCommitment } from '@/lib/supabase'
import { ProofUpload } from './ProofUpload'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useMarkDone, useMarkIncomplete, useReopenCommitment, useDeleteCommitment } from '@/hooks/useCommitments'
import clsx from 'clsx'

interface CommitmentItemProps {
  commitment: DBCommitment
  hasBlock?: boolean
  scheduledTime?: string
  readOnly?: boolean
}

export function CommitmentItem({ commitment, hasBlock, scheduledTime, readOnly = false }: CommitmentItemProps) {
  const [showLink, setShowLink] = useState(false)
  const [showIncomplete, setShowIncomplete] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')

  const markDone = useMarkDone()
  const markIncomplete = useMarkIncomplete()
  const reopen = useReopenCommitment()
  const del = useDeleteCommitment()

  const isDone = commitment.status === 'done'
  const isIncomplete = commitment.status === 'incomplete'
  const isOpen = commitment.status === 'open'

  // Pop animation when status changes to done
  const prevStatus = useRef(commitment.status)
  const [justDone, setJustDone] = useState(false)
  useEffect(() => {
    if (prevStatus.current !== 'done' && commitment.status === 'done') {
      setJustDone(true)
      const t = setTimeout(() => setJustDone(false), 600)
      return () => clearTimeout(t)
    }
    prevStatus.current = commitment.status
  }, [commitment.status])

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
        className="group flex items-start gap-3 px-3 py-2.5 rounded-[var(--radius-md)] hover:bg-[var(--bg-hover)] transition-all"
        data-draggable-commitment={isOpen ? 'true' : undefined}
        data-commitment-id={commitment.id}
        data-commitment-text={commitment.text}
      >

        {/* Status circle */}
        <button
          onClick={() => { if (isOpen && !readOnly) setShowLink(true) }}
          className={clsx(
            'mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all',
            isDone       && 'bg-[var(--success)] border-[var(--success)]',
            isIncomplete && 'border-[var(--danger)]',
            isOpen       && 'border-[var(--border-default)] hover:border-[var(--accent)] cursor-pointer',
            justDone     && 'commitment-done-pop',
          )}
          title={isOpen ? 'Mark as done' : undefined}
        >
          {isDone && (
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          {isIncomplete && <div className="w-1.5 h-1.5 rounded-full bg-[var(--danger)]" />}
        </button>

        {/* Text + meta */}
        <div className="flex-1 min-w-0">
          <p className={clsx(
            'text-[var(--text-sm)] leading-5',
            isDone       && 'line-through text-[var(--text-tertiary)]',
            isIncomplete && 'text-[var(--text-secondary)]',
            isOpen       && 'text-[var(--text-primary)]',
          )}>
            {commitment.text}
          </p>
          {hasBlock && scheduledTime && (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}
              title={`Scheduled at ${scheduledTime}`}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
                <rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M4 1v2M8 1v2M1 5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{scheduledTime}</span>
            </div>
          )}
          {isDone && commitment.proof_url && (
            <a href={commitment.proof_url} target="_blank" rel="noopener noreferrer"
              className="text-[var(--text-xs)] text-[var(--accent)] hover:text-[var(--accent-hover)] mt-0.5 block">
              View link →
            </a>
          )}
          {isIncomplete && commitment.incomplete_reason && (
            <p className="text-[var(--text-xs)] text-[var(--text-tertiary)] mt-0.5 italic">
              "{commitment.incomplete_reason}"
            </p>
          )}
        </div>

        {/* Actions — hidden in read-only mode */}
        <div className={clsx(
          'flex items-center gap-1 flex-shrink-0 transition-opacity',
          isOpen ? 'opacity-0 group-hover:opacity-100' : 'opacity-100',
          readOnly && 'hidden'
        )}>
          {isOpen && (
            <>
              <button onClick={() => setShowLink(true)}
                className="text-[var(--text-xs)] text-[var(--success)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-active)] transition-colors"
                title="Mark done">Done</button>
              <button onClick={() => setShowIncomplete(true)}
                className="text-[var(--text-xs)] text-[var(--text-tertiary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-active)] transition-colors"
                title="Mark incomplete">Skip</button>
            </>
          )}
          {(isDone || isIncomplete) && (
            <button onClick={() => reopen.mutate(commitment.id)}
              className="text-[var(--text-xs)] text-[var(--text-tertiary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-active)] hover:text-[var(--text-secondary)] transition-colors"
              title="Reopen">Reopen</button>
          )}
          <button onClick={() => del.mutate(commitment.id)}
            className="text-[var(--text-xs)] text-[var(--text-tertiary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-active)] hover:text-[var(--danger)] transition-colors"
            title="Delete">✕</button>
        </div>
      </div>

      {/* Link sheet */}
      <ProofUpload
        open={showLink}
        onClose={() => setShowLink(false)}
        commitmentText={commitment.text}
        onConfirm={(proofUrl, proofType) => { markDone.mutate({ id: commitment.id, proofUrl, proofType }); setShowLink(false) }}
        onSkip={() => { markDone.mutate({ id: commitment.id }); setShowLink(false) }}
      />

      {/* Mark incomplete modal */}
      <Modal open={showIncomplete} onClose={() => setShowIncomplete(false)} title="Mark as incomplete">
        <div className="flex flex-col gap-4">
          <p className="text-[var(--text-sm)] text-[var(--text-secondary)] -mt-2">"{commitment.text}"</p>
          <div className="flex flex-col gap-1">
            <label className="text-[var(--text-xs)] text-[var(--text-secondary)] font-medium">
              What got in the way? (required)
            </label>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleMarkIncomplete()}
              placeholder="Briefly describe the reason..."
              autoFocus
              className="h-9 rounded-[var(--radius-md)] bg-[var(--bg-base)] border px-3 text-[var(--text-sm)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] focus:shadow-[0_0_0_3px_rgba(124,111,224,0.15)]"
              style={{ borderColor: reasonError ? 'var(--danger)' : 'var(--border-default)' }}
            />
            {reasonError && <span className="text-[var(--text-xs)] text-[var(--danger)]">{reasonError}</span>}
          </div>
          <div className="flex gap-2 justify-end">
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
