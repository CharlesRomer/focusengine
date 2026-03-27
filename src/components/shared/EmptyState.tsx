import { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  subtitle?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-[var(--space-3)] py-[var(--space-10)] px-[var(--space-6)]">
      {icon && (
        <div className="text-[var(--text-tertiary)] w-6 h-6 flex items-center justify-center">
          {icon}
        </div>
      )}
      <div className="text-center">
        <p className="text-[var(--text-base)] text-[var(--text-secondary)]">{title}</p>
        {subtitle && (
          <p className="text-[var(--text-sm)] text-[var(--text-tertiary)] mt-1">{subtitle}</p>
        )}
      </div>
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
