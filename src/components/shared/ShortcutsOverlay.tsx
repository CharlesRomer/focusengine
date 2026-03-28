interface ShortcutsOverlayProps {
  open: boolean
  onClose: () => void
}

function Key({ children }: { children: string }) {
  return (
    <kbd style={{
      display: 'inline-block',
      padding: '2px 7px',
      background: 'var(--bg-hover)',
      border: '1px solid var(--border-default)',
      borderRadius: 4,
      fontSize: 12,
      fontFamily: 'monospace',
      color: 'var(--text-secondary)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </kbd>
  )
}

function Row({ keys, label }: { keys: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '5px 0' }}>
      <Key>{keys}</Key>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'right' }}>{label}</span>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {children}
      </div>
    </div>
  )
}

export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 440,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 16,
          padding: 32,
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: 'var(--text-primary)' }}>
            Keyboard shortcuts
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-tertiary)', fontSize: 18, lineHeight: 1, padding: '2px 6px',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
          {/* Left column */}
          <div>
            <Group title="Navigation">
              <Row keys="⌘1" label="Today" />
              <Row keys="⌘2" label="Calendar" />
              <Row keys="⌘3" label="Team Pulse" />
              <Row keys="⌘4" label="Reports" />
              <Row keys="⌘5" label="Settings" />
            </Group>
            <Group title="Focus">
              <Row keys="⌘⇧F" label="Start focus session" />
              <Row keys="⌘⇧P" label="Pause / resume session" />
              <Row keys="⌘K" label="Quick capture" />
            </Group>
          </div>

          {/* Right column */}
          <div>
            <Group title="Calendar">
              <Row keys="Click + drag" label="Create focus block" />
              <Row keys="Click block" label="Edit / start session" />
              <Row keys="Drag block" label="Move block" />
              <Row keys="Drag edge" label="Resize block" />
              <Row keys="Delete" label="Delete selected block" />
            </Group>
            <Group title="General">
              <Row keys="Esc" label="Close modal / popover" />
              <Row keys="?" label="Show this help" />
            </Group>
          </div>
        </div>
      </div>
    </div>
  )
}
