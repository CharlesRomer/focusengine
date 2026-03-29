import { memo, useState, useRef, useCallback } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { format, isPast, parseISO } from 'date-fns'
import type { DBSubProjectTask, BoardMember } from '@/lib/board'

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  complete: 'Complete',
}

const STATUS_COLORS: Record<string, string> = {
  not_started: 'var(--text-tertiary)',
  in_progress: 'var(--accent)',
  blocked: 'var(--danger)',
  complete: 'var(--success)',
}

export type SubProjectNodeData = {
  name: string
  description: string | null
  status: 'not_started' | 'in_progress' | 'blocked' | 'complete'
  owner: { id: string; display_name: string; avatar_color: string } | null
  due_date: string | null
  tasks: DBSubProjectTask[]
  members: BoardMember[]
  onTaskToggle: (taskId: string, is_complete: boolean, proof_url?: string) => void
  onTaskAdd: (title: string) => void
  onTaskDelete: (taskId: string) => void
  onNodeClick: () => void
}

export const SubProjectNode = memo(function SubProjectNode({ data, selected }: NodeProps) {
  const d = data as SubProjectNodeData
  const [newTask, setNewTask] = useState('')
  const [proofTaskId, setProofTaskId] = useState<string | null>(null)
  const [proofUrl, setProofUrl] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const proofInputRef = useRef<HTMLInputElement>(null)

  const completedCount = d.tasks.filter(t => t.is_complete).length
  const totalCount = d.tasks.length
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const isOverdue = d.due_date && !['complete'].includes(d.status) && isPast(parseISO(d.due_date))

  const handleAddTask = useCallback(() => {
    const title = newTask.trim()
    if (!title) return
    d.onTaskAdd(title)
    setNewTask('')
  }, [newTask, d])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      handleAddTask()
    }
  }, [handleAddTask])

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-lg)',
        width: 280,
        maxHeight: 420,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: selected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
        overflow: 'hidden',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: 'var(--accent)', width: 8, height: 8, border: '2px solid var(--bg-surface)' }}
      />

      {/* Header — clickable to open side panel */}
      <div
        style={{ padding: '12px 14px 10px', cursor: 'pointer', flexShrink: 0 }}
        onClick={(e) => { e.stopPropagation(); d.onNodeClick() }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <span style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontWeight: 500, flex: 1, lineHeight: 1.3 }}>
            {d.name}
          </span>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: STATUS_COLORS[d.status],
              background: `${STATUS_COLORS[d.status]}18`,
              border: `1px solid ${STATUS_COLORS[d.status]}40`,
              borderRadius: 'var(--radius-sm)',
              padding: '1px 6px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {STATUS_LABELS[d.status]}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {d.owner && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: d.owner.avatar_color ?? 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  color: 'white',
                  fontWeight: 500,
                  flexShrink: 0,
                }}
              >
                {d.owner.display_name[0]?.toUpperCase()}
              </div>
              <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
                {d.owner.display_name}
              </span>
            </div>
          )}
          {d.due_date && (
            <span
              style={{
                fontSize: 'var(--text-xs)',
                color: isOverdue ? 'var(--danger)' : 'var(--text-tertiary)',
              }}
            >
              {isOverdue ? '⚠ ' : ''}{format(parseISO(d.due_date), 'MMM d')}
            </span>
          )}
        </div>

        {totalCount > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ height: 3, background: 'var(--bg-hover)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: 'var(--success)', borderRadius: 2, transition: 'width 300ms ease' }} />
            </div>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', display: 'block', marginTop: 3 }}>
              {completedCount}/{totalCount} tasks
            </span>
          </div>
        )}
      </div>

      {/* Task list */}
      {d.tasks.length > 0 && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            borderTop: '1px solid var(--border-subtle)',
            padding: '6px 0',
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          {d.tasks.map(task => {
            const taskOwner = task.owner_id ? d.members.find(m => m.id === task.owner_id) : null
            const showProofInput = proofTaskId === task.id
            return (
              <div key={task.id} onMouseDown={e => e.stopPropagation()}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 14px',
                    cursor: 'default',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={task.is_complete}
                    onChange={e => {
                      e.stopPropagation()
                      if (e.target.checked) {
                        setProofTaskId(task.id)
                        setProofUrl('')
                        setTimeout(() => proofInputRef.current?.focus(), 50)
                      } else {
                        d.onTaskToggle(task.id, false)
                        if (proofTaskId === task.id) setProofTaskId(null)
                      }
                    }}
                    style={{ cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }}
                  />
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: task.is_complete ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                      textDecoration: task.is_complete ? 'line-through' : 'none',
                      flex: 1,
                      lineHeight: 1.4,
                    }}
                  >
                    {task.title}
                  </span>
                  {task.proof_url && (
                    <a
                      href={task.proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View proof"
                      onClick={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                      style={{ color: 'var(--accent)', fontSize: 11, lineHeight: 1, flexShrink: 0, textDecoration: 'none' }}
                    >
                      ↗
                    </a>
                  )}
                  {taskOwner && (
                    <div
                      title={taskOwner.display_name}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: taskOwner.avatar_color ?? 'var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 9,
                        color: 'white',
                        fontWeight: 500,
                        flexShrink: 0,
                      }}
                    >
                      {taskOwner.display_name[0]?.toUpperCase()}
                    </div>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); d.onTaskDelete(task.id) }}
                    onMouseDown={e => e.stopPropagation()}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-tertiary)',
                      padding: '0 2px',
                      fontSize: 12,
                      lineHeight: 1,
                      opacity: 0.6,
                      transition: 'opacity 150ms ease',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
                  >
                    ×
                  </button>
                </div>
                {showProofInput && (
                  <div
                    style={{ padding: '0 14px 6px 38px', display: 'flex', gap: 6, alignItems: 'center' }}
                    onMouseDown={e => e.stopPropagation()}
                  >
                    <input
                      ref={proofInputRef}
                      value={proofUrl}
                      onChange={e => setProofUrl(e.target.value)}
                      placeholder="Proof URL (optional)…"
                      onKeyDown={e => {
                        e.stopPropagation()
                        if (e.key === 'Enter') {
                          d.onTaskToggle(task.id, true, proofUrl.trim() || undefined)
                          setProofTaskId(null)
                        }
                        if (e.key === 'Escape') {
                          d.onTaskToggle(task.id, true)
                          setProofTaskId(null)
                        }
                      }}
                      onClick={e => e.stopPropagation()}
                      style={{
                        flex: 1,
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-secondary)',
                        fontSize: 'var(--text-xs)',
                        padding: '3px 6px',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        d.onTaskToggle(task.id, true, proofUrl.trim() || undefined)
                        setProofTaskId(null)
                      }}
                      onMouseDown={e => e.stopPropagation()}
                      style={{
                        background: 'var(--accent)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        color: 'white',
                        fontSize: 'var(--text-xs)',
                        padding: '3px 8px',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Quick-add task */}
      <div
        style={{ borderTop: '1px solid var(--border-subtle)', padding: '6px 14px', flexShrink: 0 }}
        onMouseDown={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={newTask}
          onChange={e => setNewTask(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="+ Add task…"
          style={{
            width: '100%',
            background: 'none',
            border: 'none',
            outline: 'none',
            color: 'var(--text-secondary)',
            fontSize: 'var(--text-xs)',
            padding: 0,
          }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        />
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: 'var(--accent)', width: 8, height: 8, border: '2px solid var(--bg-surface)' }}
      />
    </div>
  )
})
