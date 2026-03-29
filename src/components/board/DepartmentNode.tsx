import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

export type DepartmentNodeData = {
  name: string
  taskCount: number
  completedTaskCount: number
  selected?: boolean
}

export const DepartmentNode = memo(function DepartmentNode({ data, selected }: NodeProps) {
  const d = data as DepartmentNodeData
  const progress = d.taskCount > 0 ? Math.round((d.completedTaskCount / d.taskCount) * 100) : 0

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '12px 16px',
        minWidth: 180,
        boxShadow: selected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
        userSelect: 'none',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: 'var(--accent)', width: 8, height: 8, border: '2px solid var(--bg-surface)' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: d.taskCount > 0 ? 8 : 0 }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>DEPT</span>
        <span style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontWeight: 500, flex: 1 }}>
          {d.name}
        </span>
        {d.taskCount > 0 && (
          <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
            {d.completedTaskCount}/{d.taskCount}
          </span>
        )}
      </div>
      {d.taskCount > 0 && (
        <div style={{ height: 3, background: 'var(--bg-hover)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 300ms ease' }} />
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: 'var(--accent)', width: 8, height: 8, border: '2px solid var(--bg-surface)' }}
      />
    </div>
  )
})
