type Status = 'locked_in' | 'in_meeting' | 'available' | 'offline'

const styles: Record<Status, { bg: string; text: string; label: string }> = {
  locked_in:  { bg: 'rgba(124,111,224,0.15)', text: '#9183F0', label: 'Locked In' },
  in_meeting: { bg: 'rgba(90,159,224,0.15)',  text: '#6FB0E8', label: 'In Meeting' },
  available:  { bg: 'rgba(255,255,255,0.06)', text: 'var(--text-secondary)', label: 'Available' },
  offline:    { bg: 'transparent',            text: 'var(--text-tertiary)', label: 'Offline' },
}

interface StatusBadgeProps {
  status: Status
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const s = styles[status]
  return (
    <span
      style={{
        background: s.bg,
        color: s.text,
        height: 20,
        padding: '0 8px',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--text-xs)',
        fontWeight: 500,
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {s.label}
    </span>
  )
}
