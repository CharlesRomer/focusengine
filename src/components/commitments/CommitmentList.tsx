import { useState, KeyboardEvent, useRef, useEffect } from 'react'
import { Draggable } from '@fullcalendar/interaction'
import { useCommitments, useAddCommitment } from '@/hooks/useCommitments'
import { useFocusBlocks } from '@/hooks/useFocusBlocks'
import { CommitmentItem } from './CommitmentItem'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/shared/Skeleton'
import { todayLocal } from '@/lib/time'

const MAX_COMMITMENTS = 5

function fmtScheduledTime(startTime: string): string {
  const [h, m] = startTime.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${displayH}:${String(m).padStart(2, '0')}${suffix}`
}

interface CommitmentListProps {
  date?: string      // ISO date like "2025-03-27", defaults to today
  readOnly?: boolean // past days are read-only
}

export function CommitmentList({ date, readOnly = false }: CommitmentListProps) {
  const targetDate = date ?? todayLocal()
  const { data: commitments, isLoading } = useCommitments(targetDate)
  const { data: focusBlocks = [] } = useFocusBlocks(targetDate)
  const addCommitment = useAddCommitment(targetDate)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)

  const active = commitments?.filter(c => !c.deleted_at) ?? []
  const sorted = [...active].sort((a, b) => {
    if (a.status === 'open' && b.status !== 'open') return -1
    if (b.status === 'open' && a.status !== 'open') return 1
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
  const canAdd = !readOnly && active.length < MAX_COMMITMENTS

  // Initialize FullCalendar Draggable on the commitment list container
  useEffect(() => {
    if (readOnly) return
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
  }, [readOnly])

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

  const remaining = MAX_COMMITMENTS - active.length

  return (
    <div className="flex flex-col">
      {/* Read-only banner for past days */}
      {readOnly && (
        <div style={{
          padding: '4px 12px 8px',
          fontSize: 11,
          color: 'var(--text-tertiary)',
          fontStyle: 'italic',
        }}>
          Read only — past day
        </div>
      )}

      <div ref={listRef}>
        {active.length === 0 ? (
          <EmptyState
            icon={
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M7 10h6M10 7v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            }
            title={readOnly ? 'No commitments this day' : 'Nothing committed yet'}
            subtitle={readOnly ? undefined : 'Add up to 5 commitments for today'}
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
                  readOnly={readOnly}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Add input — only when not read-only and under the limit */}
      {canAdd && (
        <div className="px-3 pt-2">
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              active.length === 0
                ? 'What must get done today? + Enter'
                : `Add another (${remaining} of ${MAX_COMMITMENTS} remaining) + Enter`
            }
            disabled={addCommitment.isPending}
            className="w-full h-9 bg-transparent border border-[var(--border-default)] rounded-[var(--radius-md)] px-3 text-[var(--text-sm)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] focus:shadow-[0_0_0_3px_rgba(124,111,224,0.15)] transition-all disabled:opacity-50"
          />
        </div>
      )}
      {!readOnly && !canAdd && (
        <p className="px-3 pt-2 text-[var(--text-xs)] text-[var(--text-tertiary)]">
          Max {MAX_COMMITMENTS} commitments per day
        </p>
      )}
    </div>
  )
}
