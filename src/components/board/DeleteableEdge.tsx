import { memo } from 'react'
import { getSmoothStepPath, EdgeLabelRenderer, BaseEdge, type EdgeProps } from '@xyflow/react'

export type DeleteableEdgeData = {
  onDelete?: (id: string) => void
}

export const DeleteableEdge = memo(function DeleteableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps) {
  const d = data as DeleteableEdgeData | undefined

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? 'var(--accent)' : 'var(--border-strong)',
          strokeWidth: selected ? 2 : 1.5,
          transition: 'stroke 150ms ease',
        }}
      />
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              zIndex: 10,
            }}
            className="nodrag nopan"
          >
            <button
              onClick={() => d?.onDelete?.(id)}
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: 'var(--danger)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 11,
                lineHeight: 1,
                fontWeight: 500,
              }}
              title="Delete connection"
            >
              ×
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
