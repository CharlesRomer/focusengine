import type { ReactNode } from 'react'

interface ReportCardProps {
  title: string
  subtitle?: string
  loading?: boolean
  empty?: boolean
  emptyMessage?: string
  children: ReactNode
  className?: string
}

export function ReportCard({
  title,
  subtitle,
  loading,
  empty,
  emptyMessage = 'No data for this period',
  children,
  className = '',
}: ReportCardProps) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-6)',
      }}
    >
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)' }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>

      {loading ? (
        <CardSkeleton />
      ) : empty ? (
        <div
          style={{
            height: 120,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {emptyMessage}
        </div>
      ) : (
        children
      )}
    </div>
  )
}

function CardSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="skeleton" style={{ height: 120, borderRadius: 6 }} />
      <div className="skeleton" style={{ height: 14, width: '60%', borderRadius: 4 }} />
      <div className="skeleton" style={{ height: 14, width: '40%', borderRadius: 4 }} />
    </div>
  )
}
