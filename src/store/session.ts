import { create } from 'zustand'
import type { DBFocusSession } from '@/lib/supabase'

interface SessionState {
  activeSession: DBFocusSession | null
  liveScore: number | null
  setActiveSession: (session: DBFocusSession | null) => void
  updateSession: (updates: Partial<DBFocusSession>) => void
  clearSession: () => void
  setLiveScore: (score: number | null) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  activeSession: null,
  liveScore: null,
  setActiveSession: (session) => set({ activeSession: session, liveScore: null }),
  updateSession: (updates) => set(state => ({
    activeSession: state.activeSession ? { ...state.activeSession, ...updates } : null,
  })),
  clearSession: () => set({ activeSession: null, liveScore: null }),
  setLiveScore: (score) => set({ liveScore: score }),
}))
