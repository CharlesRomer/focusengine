import { forwardRef, ButtonHTMLAttributes } from 'react'
import clsx from 'clsx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, children, className, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center font-medium rounded-[var(--radius-md)] transition-all duration-150 cursor-pointer select-none'
    const sizes = {
      sm: 'px-3 py-1.5 text-[var(--text-xs)]',
      md: 'px-[18px] py-[10px] text-[var(--text-sm)]',
    }
    const variants = {
      primary: 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] active:scale-[0.98] disabled:opacity-40',
      secondary: 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--bg-hover)] disabled:opacity-40',
      ghost: 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40',
      danger: 'bg-[var(--danger)] text-white hover:opacity-90 active:scale-[0.98] disabled:opacity-40',
    }
    return (
      <button
        ref={ref}
        className={clsx(base, sizes[size], variants[variant], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <span className="text-[var(--text-disabled)]">...</span> : children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export function IconButton({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        'w-8 h-8 flex items-center justify-center rounded-[var(--radius-md)] bg-transparent',
        'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
        'transition-all duration-150 cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
