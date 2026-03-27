import { useEffect, HTMLAttributes } from 'react'
import clsx from 'clsx'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={clsx(
          'bg-[var(--bg-elevated)] rounded-[var(--radius-xl)] p-[var(--space-8)]',
          'shadow-[var(--shadow-lg)] w-full max-w-[480px] mx-4',
          'transition-all duration-200',
          className
        )}
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <h2 className="text-[var(--text-lg)] font-semibold text-[var(--text-primary)] mb-[var(--space-6)]">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  )
}

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex items-end justify-center',
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      )}
      style={{
        background: open ? 'rgba(0,0,0,0.7)' : 'transparent',
        transition: open ? 'opacity 220ms ease-out' : 'opacity 180ms ease-in',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={clsx(
          'bg-[var(--bg-elevated)] w-full max-h-[60vh] overflow-y-auto',
          'rounded-tl-[var(--radius-xl)] rounded-tr-[var(--radius-xl)]',
          'shadow-[var(--shadow-lg)]',
          open ? 'translate-y-0' : 'translate-y-full'
        )}
        style={{ transition: open ? 'transform 220ms ease-out' : 'transform 180ms ease-in' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-8 h-1 rounded-full bg-[var(--bg-hover)]" />
        </div>
        {title && (
          <div className="px-[var(--space-6)] py-[var(--space-4)] border-b border-[var(--border-subtle)]">
            <h3 className="text-[var(--text-base)] font-semibold text-[var(--text-primary)]">{title}</h3>
          </div>
        )}
        <div className="p-[var(--space-6)]">{children}</div>
      </div>
    </div>
  )
}
