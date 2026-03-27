import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { ReactNode } from 'react'

interface NavItemProps {
  to: string
  icon: ReactNode
  label: string
  shortcut?: string
}

export function NavItem({ to, icon, label, shortcut }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-[var(--space-3)] h-9 px-[var(--space-4)] rounded-[var(--radius-md)]',
          'text-[var(--text-sm)] font-medium transition-all duration-150 select-none',
          'border-l-2',
          isActive
            ? 'bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent)]'
            : 'text-[var(--text-secondary)] border-transparent hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        )
      }
    >
      <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="text-[var(--text-xs)] text-[var(--text-tertiary)] font-normal">{shortcut}</span>
      )}
    </NavLink>
  )
}
