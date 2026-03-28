import { useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { TimeBreakdownCard } from '@/components/reports/TimeBreakdownCard'
import { FocusScoreTrendCard } from '@/components/reports/FocusScoreTrendCard'
import { BestFocusWindowsCard } from '@/components/reports/BestFocusWindowsCard'
import { SessionsCard } from '@/components/reports/SessionsCard'
import { CommitmentsCard } from '@/components/reports/CommitmentsCard'
import { TopDistractionsCard } from '@/components/reports/TopDistractionsCard'
import { AppBreakdownCard } from '@/components/reports/AppBreakdownCard'
import { TeamTab } from '@/components/reports/TeamTab'
import { getWindowBounds, type TimeWindow } from '@/lib/reports'

const WINDOWS: { key: TimeWindow; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: '30days', label: 'Last 30 days' },
]

export function ReportsScreen() {
  const user = useAuthStore((s) => s.user)
  const [activeTab, setActiveTab] = useState<'mine' | 'team'>('mine')
  const [window, setWindow] = useState<TimeWindow>('week')

  if (!user) return null

  const isAdmin = user.role === 'admin'

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 'var(--space-8)',
        maxWidth: 1200,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 'var(--space-6)',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
        }}
      >
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 2 }}>
          <TabBtn active={activeTab === 'mine'} onClick={() => setActiveTab('mine')}>
            My reports
          </TabBtn>
          {isAdmin && (
            <TabBtn active={activeTab === 'team'} onClick={() => setActiveTab('team')}>
              Team
            </TabBtn>
          )}
        </div>

        {/* Time window selector */}
        <div
          style={{
            display: 'flex',
            gap: 2,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 3,
          }}
        >
          {WINDOWS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setWindow(key)}
              style={{
                padding: '5px 12px',
                fontSize: 'var(--text-xs)',
                borderRadius: 5,
                border: 'none',
                cursor: 'pointer',
                background: window === key ? 'var(--bg-active)' : 'transparent',
                color: window === key ? 'var(--text-primary)' : 'var(--text-tertiary)',
                transition: 'all 150ms',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* My reports tab */}
      {activeTab === 'mine' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {/* Row 1: Time breakdown + Focus score trend */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--space-5)',
            }}
          >
            <TimeBreakdownCard userId={user.id} window={window} />
            <FocusScoreTrendCard userId={user.id} window={window} />
          </div>

          {/* Row 2: Best focus windows (full width) */}
          <BestFocusWindowsCard userId={user.id} />

          {/* Row 3: Sessions + Commitments */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--space-5)',
            }}
          >
            <SessionsCard userId={user.id} window={window} />
            <CommitmentsCard userId={user.id} window={window} />
          </div>

          {/* Row 4: App breakdown + Top distractions */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--space-5)',
            }}
          >
            <AppBreakdownCard userId={user.id} window={window} />
            <TopDistractionsCard userId={user.id} window={window} />
          </div>
        </div>
      )}

      {/* Team tab */}
      {activeTab === 'team' && isAdmin && (
        <TeamTab user={user} window={window} />
      )}
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 16px',
        fontSize: 'var(--text-sm)',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        background: active ? 'var(--bg-active)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
        transition: 'all 150ms',
      }}
    >
      {children}
    </button>
  )
}
