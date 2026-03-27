import { useEffect } from 'react'
import { useUIStore } from '@/store/ui'
import clsx from 'clsx'

export interface ToastItem {
  id: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
}

export function ToastContainer() {
  const toasts = useUIStore(s => s.toasts)
  const removeToast = useUIStore(s => s.removeToast)

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.slice(0, 3).map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  const borderColors = {
    success: 'border-l-[var(--success)]',
    error:   'border-l-[var(--danger)]',
    warning: 'border-l-[var(--warning)]',
    info:    'border-l-[var(--info)]',
  }

  return (
    <div
      className={clsx(
        'w-80 bg-[var(--bg-elevated)] rounded-[var(--radius-md)] p-[var(--space-4)]',
        'border border-[var(--border-default)] border-l-4 shadow-[var(--shadow-md)]',
        'pointer-events-auto flex items-start gap-3',
        borderColors[toast.type]
      )}
    >
      <p className="flex-1 text-[var(--text-sm)] text-[var(--text-primary)]">{toast.message}</p>
      <button
        onClick={onDismiss}
        className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] text-xs mt-0.5 flex-shrink-0"
      >
        ✕
      </button>
    </div>
  )
}
