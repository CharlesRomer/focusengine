import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes } from 'react'
import clsx from 'clsx'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
  label?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, label, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-[var(--space-1)]">
        {label && (
          <label htmlFor={inputId} className="text-[var(--text-xs)] text-[var(--text-secondary)] font-medium">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            'h-9 rounded-[var(--radius-md)] bg-[var(--bg-elevated)] border text-[var(--text-primary)]',
            'px-3 text-[var(--text-sm)] placeholder:text-[var(--text-tertiary)]',
            'focus:outline-none focus:shadow-[0_0_0_3px_rgba(124,111,224,0.15)]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error
              ? 'border-[var(--danger)] focus:border-[var(--danger)]'
              : 'border-[var(--border-default)] focus:border-[var(--border-strong)]',
            className
          )}
          {...props}
        />
        {error && (
          <span className="text-[var(--text-xs)] text-[var(--danger)]">{error}</span>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string
  label?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, label, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-[var(--space-1)]">
        {label && (
          <label htmlFor={inputId} className="text-[var(--text-xs)] text-[var(--text-secondary)] font-medium">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={clsx(
            'rounded-[var(--radius-md)] bg-[var(--bg-elevated)] border text-[var(--text-primary)]',
            'px-3 py-[10px] text-[var(--text-sm)] placeholder:text-[var(--text-tertiary)]',
            'min-h-[80px] resize-y',
            'focus:outline-none focus:shadow-[0_0_0_3px_rgba(124,111,224,0.15)]',
            'disabled:opacity-50',
            error
              ? 'border-[var(--danger)] focus:border-[var(--danger)]'
              : 'border-[var(--border-default)] focus:border-[var(--border-strong)]',
            className
          )}
          {...props}
        />
        {error && (
          <span className="text-[var(--text-xs)] text-[var(--danger)]">{error}</span>
        )}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'
