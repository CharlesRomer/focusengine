import { useState, useEffect, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import type { SubProjectWithTasks, BoardMember } from '@/lib/board'

interface Props {
  subProject: SubProjectWithTasks | null
  members: BoardMember[]
  onClose: () => void
  onUpdate: (updates: { name?: string; description?: string | null; owner_id?: string | null; start_date?: string | null; due_date?: string | null; status?: SubProjectWithTasks['status'] }) => void
  onAddTask: (title: string) => void
  onUpdateTask: (taskId: string, updates: { title?: string; owner_id?: string | null; is_complete?: boolean }) => void
  onDeleteTask: (taskId: string) => void
  onDelete: () => void
}

const STATUS_OPTIONS: { value: SubProjectWithTasks['status']; label: string; color: string }[] = [
  { value: 'not_started', label: 'Not Started', color: 'var(--text-tertiary)' },
  { value: 'in_progress', label: 'In Progress', color: 'var(--accent)' },
  { value: 'blocked',     label: 'Blocked',     color: 'var(--danger)' },
  { value: 'complete',    label: 'Complete',     color: 'var(--success)' },
]

export function SubProjectPanel({ subProject, members, onClose, onUpdate, onAddTask, onUpdateTask, onDeleteTask, onDelete }: Props) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [newTask, setNewTask] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (subProject) {
      setName(subProject.name)
      setDesc(subProject.description ?? '')
      setConfirmDelete(false)
    }
  }, [subProject?.id])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!subProject) return null

  const handleNameBlur = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== subProject.name) onUpdate({ name: trimmed })
  }

  const handleDescBlur = () => {
    const val = desc.trim() || null
    if (val !== subProject.description) onUpdate({ description: val })
  }

  const handleAddTask = () => {
    const title = newTask.trim()
    if (!title) return
    onAddTask(title)
    setNewTask('')
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 39 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 380,
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 40,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', flex: 1 }}>Sub-project details</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 18, lineHeight: 1, padding: 4 }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Name */}
          <div>
            <label style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', marginBottom: 4 }}>Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={handleNameBlur}
              style={{
                width: '100%',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-base)',
                fontWeight: 500,
                padding: '8px 10px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', marginBottom: 4 }}>Description</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              onBlur={handleDescBlur}
              rows={3}
              placeholder="Add a description…"
              style={{
                width: '100%',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-secondary)',
                fontSize: 'var(--text-sm)',
                padding: '8px 10px',
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Status */}
          <div>
            <label style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', marginBottom: 6 }}>Status</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => onUpdate({ status: opt.value })}
                  style={{
                    flex: 1,
                    padding: '5px 8px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${subProject.status === opt.value ? opt.color : 'var(--border-subtle)'}`,
                    background: subProject.status === opt.value ? `${opt.color}18` : 'transparent',
                    color: subProject.status === opt.value ? opt.color : 'var(--text-tertiary)',
                    fontSize: 'var(--text-xs)',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Owner */}
          <div>
            <label style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', marginBottom: 4 }}>Owner</label>
            <select
              value={subProject.owner_id ?? ''}
              onChange={e => onUpdate({ owner_id: e.target.value || null })}
              style={{
                width: '100%',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-secondary)',
                fontSize: 'var(--text-sm)',
                padding: '7px 10px',
                outline: 'none',
                cursor: 'pointer',
                boxSizing: 'border-box',
              }}
            >
              <option value="">Unassigned</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.display_name}</option>
              ))}
            </select>
          </div>

          {/* Start date + Due date */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', marginBottom: 4 }}>Start date</label>
              <input
                type="date"
                value={subProject.start_date ?? ''}
                onChange={e => onUpdate({ start_date: e.target.value || null })}
                style={{
                  width: '100%',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--text-sm)',
                  padding: '7px 10px',
                  outline: 'none',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  colorScheme: 'dark',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', marginBottom: 4 }}>Due date</label>
              <input
                type="date"
                value={subProject.due_date ?? ''}
                onChange={e => onUpdate({ due_date: e.target.value || null })}
                style={{
                  width: '100%',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--text-sm)',
                  padding: '7px 10px',
                  outline: 'none',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  colorScheme: 'dark',
                }}
              />
            </div>
          </div>

          {/* Tasks */}
          <div>
            <label style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', marginBottom: 8 }}>
              Tasks ({subProject.tasks.filter(t => t.is_complete).length}/{subProject.tasks.length})
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
              {subProject.tasks.map(task => (
                <div
                  key={task.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '5px 8px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-elevated)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={task.is_complete}
                    onChange={e => onUpdateTask(task.id, { is_complete: e.target.checked })}
                    style={{ cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }}
                  />
                  <span
                    style={{
                      flex: 1,
                      color: task.is_complete ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                      fontSize: 'var(--text-sm)',
                      textDecoration: task.is_complete ? 'line-through' : 'none',
                    }}
                  >
                    {task.title}
                  </span>

                  {/* Task owner */}
                  <select
                    value={task.owner_id ?? ''}
                    onChange={e => onUpdateTask(task.id, { owner_id: e.target.value || null })}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-tertiary)',
                      fontSize: 'var(--text-xs)',
                      cursor: 'pointer',
                      outline: 'none',
                      maxWidth: 90,
                    }}
                  >
                    <option value="">—</option>
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{m.display_name}</option>
                    ))}
                  </select>

                  <button
                    onClick={() => onDeleteTask(task.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-tertiary)',
                      fontSize: 14,
                      lineHeight: 1,
                      padding: '0 2px',
                      opacity: 0.6,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Add task input */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
              }}
            >
              <input
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTask() } }}
                placeholder="Add a task…"
                style={{
                  flex: 1,
                  background: 'var(--bg-elevated)',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--text-sm)',
                  padding: '7px 10px',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleAddTask}
                style={{
                  background: 'var(--accent)',
                  border: 'none',
                  color: 'white',
                  fontSize: 'var(--text-sm)',
                  padding: '7px 14px',
                  cursor: 'pointer',
                }}
              >
                Add
              </button>
            </div>
          </div>

          {/* Created / updated info */}
          <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
            Created {format(parseISO(subProject.created_at), 'MMM d, yyyy')}
          </div>
        </div>

        {/* Delete */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          {confirmDelete ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={onDelete}
                style={{
                  flex: 1,
                  padding: '7px',
                  background: 'var(--danger)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: 'white',
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                }}
              >
                Confirm delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  flex: 1,
                  padding: '7px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{
                width: '100%',
                padding: '7px',
                background: 'none',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--danger)',
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
                transition: 'border-color 150ms ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--danger)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
            >
              Delete sub-project
            </button>
          )}
        </div>
      </div>
    </>
  )
}
