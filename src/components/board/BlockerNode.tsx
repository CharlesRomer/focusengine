import { memo, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { format, parseISO } from 'date-fns'

export type BlockerNodeData = {
  title: string
  note: string | null
  is_resolved: boolean
  resolved_at: string | null
  onResolve: () => void
  onUnresolve: () => void
  onNoteChange: (note: string) => void
}

export const BlockerNode = memo(function BlockerNode({ data, selected }: NodeProps) {
  const d = data as BlockerNodeData
  const [editingNote, setEditingNote] = useState(false)
  const [noteValue, setNoteValue] = useState(d.note ?? '')

  const handleNoteSubmit = () => {
    const trimmed = noteValue.trim()
    d.onNoteChange(trimmed || '')
    setEditingNote(false)
  }

  return (
    <div
      style={{
        background: d.is_resolved ? 'var(--bg-surface)' : 'rgba(217, 92, 92, 0.08)',
        border: `1px solid ${selected ? 'var(--danger)' : d.is_resolved ? 'var(--border-subtle)' : 'var(--danger)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '10px 14px',
        minWidth: 200,
        maxWidth: 240,
        boxShadow: selected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
        opacity: d.is_resolved ? 0.6 : 1,
        userSelect: 'none',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: 'var(--danger)', width: 8, height: 8, border: '2px solid var(--bg-surface)' }}
      />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>⛔</span>
        <span
          style={{
            color: d.is_resolved ? 'var(--text-tertiary)' : 'var(--text-primary)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            lineHeight: 1.3,
            textDecoration: d.is_resolved ? 'line-through' : 'none',
            flex: 1,
          }}
        >
          {d.title}
        </span>
      </div>

      {/* Notes — inline edit on click */}
      {editingNote ? (
        <div
          style={{ paddingLeft: 22, marginBottom: 8 }}
          onMouseDown={e => e.stopPropagation()}
        >
          <textarea
            autoFocus
            value={noteValue}
            onChange={e => setNoteValue(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleNoteSubmit() }
              if (e.key === 'Escape') { setNoteValue(d.note ?? ''); setEditingNote(false) }
            }}
            onClick={e => e.stopPropagation()}
            placeholder="Add a note…"
            rows={2}
            style={{
              width: '100%',
              background: 'var(--bg-base)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              fontSize: 'var(--text-xs)',
              padding: '4px 6px',
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.4,
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button
              onClick={e => { e.stopPropagation(); handleNoteSubmit() }}
              onMouseDown={e => e.stopPropagation()}
              style={{
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: 'white',
                fontSize: 'var(--text-xs)',
                padding: '2px 8px',
                cursor: 'pointer',
              }}
            >
              Save
            </button>
            <button
              onClick={e => { e.stopPropagation(); setNoteValue(d.note ?? ''); setEditingNote(false) }}
              onMouseDown={e => e.stopPropagation()}
              style={{
                background: 'none',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-tertiary)',
                fontSize: 'var(--text-xs)',
                padding: '2px 8px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{ paddingLeft: 22, marginBottom: 8, cursor: 'text', minHeight: 16 }}
          onClick={e => { e.stopPropagation(); setNoteValue(d.note ?? ''); setEditingNote(true) }}
          onMouseDown={e => e.stopPropagation()}
          title="Click to edit note"
        >
          {d.note ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', lineHeight: 1.4, margin: 0 }}>
              {d.note}
            </p>
          ) : (
            <p style={{ color: 'var(--text-disabled)', fontSize: 'var(--text-xs)', lineHeight: 1.4, margin: 0 }}>
              Add a note…
            </p>
          )}
        </div>
      )}

      {/* Resolved timestamp */}
      {d.is_resolved && d.resolved_at && (
        <p style={{ color: 'var(--text-disabled)', fontSize: 'var(--text-xs)', paddingLeft: 22, marginBottom: 8 }}>
          Resolved {format(parseISO(d.resolved_at), 'MMM d')}
        </p>
      )}

      {/* Resolve / Unresolve toggle */}
      {d.is_resolved ? (
        <button
          onClick={e => { e.stopPropagation(); d.onUnresolve() }}
          onMouseDown={e => e.stopPropagation()}
          style={{
            background: 'none',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--text-xs)',
            padding: '3px 10px',
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Reopen
        </button>
      ) : (
        <button
          onClick={e => { e.stopPropagation(); d.onResolve() }}
          onMouseDown={e => e.stopPropagation()}
          style={{
            background: 'rgba(217, 92, 92, 0.12)',
            border: '1px solid rgba(217, 92, 92, 0.3)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--danger)',
            fontSize: 'var(--text-xs)',
            padding: '3px 10px',
            cursor: 'pointer',
            width: '100%',
            transition: 'background 150ms ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(217, 92, 92, 0.2)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(217, 92, 92, 0.12)')}
        >
          Resolve
        </button>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: 'var(--danger)', width: 8, height: 8, border: '2px solid var(--bg-surface)' }}
      />
    </div>
  )
})
