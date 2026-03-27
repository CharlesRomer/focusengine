import { useState, KeyboardEvent, useRef, useEffect } from 'react'
import { Draggable } from '@fullcalendar/interaction'
import { useCommitments, useAddCommitment } from '@/hooks/useCommitments'
import { useFocusBlocks } from '@/hooks/useFocusBlocks'
import { CommitmentItem } from './CommitmentItem'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/shared/Skeleton'
import { todayLocal } from '@/lib/time'

const MAX_COMMITMENTS = 3

function fmtScheduledTime(startTime: string): string {
  const [h, m] = startTime.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${displayH}:${String(m).padStart(2, '0')}${suffix}`
}

export function CommitmentList() {
  const { data: commitments, isLoading } = useCommitments()
  const { data: focusBlocks = [] } = useFocusBlocks(todayLocal())
  const addCommitment = useAddCommitment()
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)

  const active = commitments?.filter(c => !c.deleted_at) ?? []
  const sorted = [...active].sort((a, b) => {
    // open items first, then done/incomplete; within each group sort by created_at asc
    if (a.status === 'open' && b.status !== 'open') return -1
    if (b.status === 'open' && a.status !== 'open') return 1
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
  const canAdd = active.length < MAX_COMMITMENTS

  // Initialize FullCalendar Draggable on the commitment list container
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const draggable = new Draggable(el, {
      itemSelector: '[data-draggable-commitment]',
      eventData: (itemEl: HTMLElement) => ({
        title:    itemEl.dataset.commitmentText ?? '',
        duration: '01:00',
        create:   false,
      }),
    })
    return () => draggable.destroy()
  }, [])

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const trimmed = text.trim()
    if (!trimmed || !canAdd) return
    addCommitment.mutate(trimmed)
    setText('')
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 px-3 py-2">
        <Skeleton height={32} />
        <Skeleton height={32} width="80%" />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div ref={listRef}>
        {active.length === 0 ? (
          <EmptyState
            icon={
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M7 10h6M10 7v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            }
            title="Nothing committed yet"
            subtitle="Add up to 3 commitments for today"
          />
        ) : (
          <div className="flex flex-col">
            {sorted.map(c => {
              const linkedBlock = focusBlocks.find(b => b.commitment_id === c.id && !b.deleted_at)
              return (
                <CommitmentItem
                  key={c.id}
                  commitment={c}
                  hasBlock={!!linkedBlock}
                  scheduledTime={linkedBlock ? fmtScheduledTime(linkedBlock.start_time) : undefined}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Add input */}
      {canAdd && (
        <div className="px-3 pt-2">
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={active.length === 0 ? 'What must get done today? + Enter' : 'Add another + Enter'}
            disabled={addCommitment.isPending}
            className="w-full h-9 bg-transparent border border-[var(--border-default)] rounded-[var(--radius-md)] px-3 text-[var(--text-sm)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] focus:shadow-[0_0_0_3px_rgba(124,111,224,0.15)] transition-all disabled:opacity-50"
          />
        </div>
      )}
      {!canAdd && (
        <p className="px-3 pt-2 text-[var(--text-xs)] text-[var(--text-tertiary)]">
          Max 3 commitments per day
        </p>
      )}
    </div>
  )
}
