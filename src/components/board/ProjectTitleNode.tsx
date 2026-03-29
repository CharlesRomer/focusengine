import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

export type ProjectTitleNodeData = {
  name: string
  description: string | null
  color: string
  totalTasks: number
  completedTasks: number
}

export const ProjectTitleNode = memo(function ProjectTitleNode({ data }: NodeProps) {
  const d = data as ProjectTitleNodeData
  const progress = d.totalTasks > 0 ? Math.round((d.completedTasks / d.totalTasks) * 100) : 0

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: `2px solid ${d.color}`,
        borderRadius: 'var(--radius-lg)',
        padding: '16px 20px',
        minWidth: 280,
        boxShadow: 'var(--shadow-md)',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
        <span style={{ color: 'var(--text-primary)', fontSize: 'var(--text-lg)', fontWeight: 500 }}>
          {d.name}
        </span>
      </div>
      {d.description && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 10, lineHeight: 1.4 }}>
          {d.description}
        </p>
      )}
      {d.totalTasks > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>Progress</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
              {d.completedTasks}/{d.totalTasks} tasks · {progress}%
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--bg-hover)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: d.color, borderRadius: 2, transition: 'width 300ms ease' }} />
          </div>
        </div>
      )}
    </div>
  )
})
