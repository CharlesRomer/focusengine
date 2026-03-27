import { HTMLAttributes } from 'react'
import clsx from 'clsx'

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)]',
        'p-[var(--space-6)] shadow-[var(--shadow-sm)]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
