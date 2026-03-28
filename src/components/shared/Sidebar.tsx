import { NavItem } from '@/components/ui/NavItem'
import { Avatar } from '@/components/shared/Avatar'
import { useAuthStore } from '@/store/auth'
import { useSessionStore } from '@/store/session'

// Simple SVG icons inline
const icons = {
  today:   <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 2v2M11 2v2M2 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  calendar:<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 2v2M11 2v2M2 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><rect x="5" y="9" width="2" height="2" rx="0.5" fill="currentColor"/></svg>,
  team:    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M1 13c0-2.761 2.239-4 5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="11" cy="6" r="2" stroke="currentColor" strokeWidth="1.5"/><path d="M10 13c0-2 1.343-3.5 3-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  reports: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 13V9M7 13V6M11 13V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  settings:<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path fillRule="evenodd" clipRule="evenodd" d="M8 10a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.5"/><path d="M8 2v1.5M8 12.5V14M14 8h-1.5M3.5 8H2M12.2 3.8l-1.06 1.06M4.86 11.14L3.8 12.2M12.2 12.2l-1.06-1.06M4.86 4.86L3.8 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
}

export function Sidebar() {
  const user          = useAuthStore(s => s.user)
  const signOut       = useAuthStore(s => s.signOut)
  const activeSession = useSessionStore(s => s.activeSession)

  return (
    <aside
      className="flex flex-col border-r"
      style={{
        width: 220,
        flexShrink: 0,
        background: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
        height: '100%',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div
          className="w-7 h-7 rounded-[var(--radius-md)] flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--accent)' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="1.5" fill="white"/>
            <path d="M7 1.5V4M7 10V12.5M1.5 7H4M10 7H12.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <span className="text-[var(--text-sm)] font-semibold text-[var(--text-primary)]">Compass</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 flex flex-col gap-0.5 overflow-y-auto">
        <div style={{ position: 'relative' }}>
          <NavItem to="/today" icon={icons.today} label="Today" shortcut="⌘1" />
          {activeSession && (
            <span style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--accent)',
              animation: 'session-pulse 2s ease-in-out infinite',
              pointerEvents: 'none',
            }} />
          )}
        </div>
        <NavItem to="/calendar" icon={icons.calendar} label="Calendar" shortcut="⌘2" />
        <NavItem to="/team" icon={icons.team} label="Team Pulse" shortcut="⌘3" />
        <NavItem to="/reports" icon={icons.reports} label="Reports" shortcut="⌘4" />
        <div className="mt-auto pt-3 border-t" style={{ borderColor: 'var(--border-subtle)', marginTop: 'auto' }}>
          <NavItem to="/settings" icon={icons.settings} label="Settings" shortcut="⌘5" />
        </div>
      </nav>

      {/* User */}
      {user && (
        <div
          className="flex items-center gap-2.5 px-4 py-3 border-t"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <Avatar userId={user.id} name={user.display_name} size={28} />
          <div className="flex-1 min-w-0">
            <p className="text-[var(--text-sm)] font-medium text-[var(--text-primary)] truncate">{user.display_name}</p>
            <p className="text-[var(--text-xs)] text-[var(--text-tertiary)] capitalize">{user.role}</p>
          </div>
          <button
            onClick={signOut}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors p-1 rounded"
            title="Sign out"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 2H3a1 1 0 00-1 1v8a1 1 0 001 1h2M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}
    </aside>
  )
}
