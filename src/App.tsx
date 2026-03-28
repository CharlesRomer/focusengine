import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/auth'
import { useSessionStore } from '@/store/session'
import { supabase } from '@/lib/supabase'
import { toast } from '@/store/ui'
import { Sidebar } from '@/components/shared/Sidebar'
import { SessionTopBar } from '@/components/shared/SessionTopBar'
import { StartSessionModal } from '@/components/shared/StartSessionModal'
import { ToastContainer } from '@/components/shared/Toast'
import { OfflineBanner } from '@/components/shared/OfflineBanner'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { ShortcutsOverlay } from '@/components/shared/ShortcutsOverlay'
import { AuthScreen } from '@/screens/Auth'
import { TodayScreen } from '@/screens/Today'
import { CalendarScreen } from '@/screens/Calendar'
import { TeamPulseScreen } from '@/screens/TeamPulse'
import { ReportsScreen } from '@/screens/Reports'
import { SettingsScreen } from '@/screens/Settings'
import { DownloadScreen } from '@/screens/Download'
import { GuideScreen } from '@/screens/Guide'
import { GoogleAuthCallback } from '@/screens/GoogleAuthCallback'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      refetchOnWindowFocus: false,
    },
  },
})

function AppRoutes() {
  const { loading }    = useAuth()
  const user           = useAuthStore(s => s.user)
  const navigate       = useNavigate()
  const activeSession  = useSessionStore(s => s.activeSession)
  const setActive      = useSessionStore(s => s.setActiveSession)

  const [showStartModal, setShowStartModal] = useState(false)
  const [showShortcuts,  setShowShortcuts]  = useState(false)

  // Restore any in-progress session on mount
  useEffect(() => {
    if (!user) return
    supabase
      .from('focus_sessions')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'paused'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data) setActive(data) })
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Global keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const inInput = (e.target as HTMLElement).matches('input, textarea, [contenteditable]')

      // Navigation: ⌘1–5
      if (e.metaKey && !e.shiftKey && !inInput) {
        const map: Record<string, string> = {
          '1': '/today', '2': '/calendar', '3': '/team', '4': '/reports', '5': '/settings',
        }
        if (map[e.key]) { e.preventDefault(); navigate(map[e.key]); return }
      }

      // ⌘⇧F — start session (or toast if one already running)
      if (e.metaKey && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        const sess = useSessionStore.getState().activeSession
        if (sess) {
          toast('Session already running', 'info')
        } else {
          setShowStartModal(true)
        }
      }

      // ? — shortcuts overlay (not in inputs)
      if (e.key === '?' && !inInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setShowShortcuts(s => !s)
      }

      // Esc — close shortcuts overlay
      if (e.key === 'Escape') {
        setShowShortcuts(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  // Not authenticated
  if (!loading && !user) {
    return (
      <Routes>
        <Route path="/download" element={<DownloadScreen />} />
        <Route path="/auth/google/callback" element={<GoogleAuthCallback />} />
        <Route path="*" element={<AuthScreen />} />
      </Routes>
    )
  }

  // Authenticated but no team yet
  if (!loading && user && !user.team_org_id) {
    return (
      <Routes>
        <Route path="/download" element={<DownloadScreen />} />
        <Route path="/auth/google/callback" element={<GoogleAuthCallback />} />
        <Route path="*" element={<AuthScreen initialStep="team" userId={user.id} />} />
      </Routes>
    )
  }

  // Loading spinner (only when no persisted user yet)
  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="w-7 h-7 rounded-[var(--radius-md)]" style={{ background: 'var(--accent)', opacity: 0.7 }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg-base)' }}>
      <SessionTopBar />
      <OfflineBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden flex flex-col">
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today"    element={<ErrorBoundary key="today"><TodayScreen /></ErrorBoundary>} />
            <Route path="/calendar" element={<ErrorBoundary key="calendar"><CalendarScreen /></ErrorBoundary>} />
            <Route path="/team"     element={<ErrorBoundary key="team"><TeamPulseScreen /></ErrorBoundary>} />
            <Route path="/reports"  element={<ErrorBoundary key="reports"><ReportsScreen /></ErrorBoundary>} />
            <Route path="/settings" element={<ErrorBoundary key="settings"><SettingsScreen /></ErrorBoundary>} />
            <Route path="/download"             element={<DownloadScreen />} />
            <Route path="/auth/google/callback" element={<GoogleAuthCallback />} />
            <Route path="/guide"                element={<ErrorBoundary key="guide"><GuideScreen /></ErrorBoundary>} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </main>
      </div>

      <StartSessionModal
        open={showStartModal}
        onClose={() => setShowStartModal(false)}
      />

      <ShortcutsOverlay
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
        <ToastContainer />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
