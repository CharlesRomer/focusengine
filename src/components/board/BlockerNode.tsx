import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

export type BlockerNodeData = {
  title: string
  note: string | null
  is_resolved: boolean
  onResolve: () => void
}

export const BlockerNode = memo(function BlockerNode({ data, selected }: NodeProps) {
  const d = data as BlockerNodeData

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
        opacity: d.is_resolved ? 0.55 : 1,
        userSelect: 'none',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: 'var(--danger)', width: 8, height: 8, border: '2px solid var(--bg-surface)' }}
      />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: d.note ? 6 : 8 }}>
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

      {d.note && (
        <p
          style={{
            color: 'var(--text-tertiary)',
            fontSize: 'var(--text-xs)',
            lineHeight: 1.4,
            marginBottom: 8,
            paddingLeft: 22,
          }}
        >
          {d.note}
        </p>
      )}

      {!d.is_resolved && (
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
