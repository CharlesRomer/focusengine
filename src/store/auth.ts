import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase, type DBUser } from '@/lib/supabase'

interface AuthState {
  user: DBUser | null
  loading: boolean
  setUser: (user: DBUser | null) => void
  setLoading: (loading: boolean) => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      // If we have a persisted user, start with loading:false — no spinner needed.
      // onAuthStateChange will re-validate in the background.
      loading: true,
      setUser: (user) => set({ user }),
      setLoading: (loading) => set({ loading }),
      signOut: async () => {
        await supabase.auth.signOut()
        set({ user: null })
      },
    }),
    {
      name: 'compass-auth',
      // Only persist `user`, never `loading`
      partialize: (state) => ({ user: state.user }),
      // On rehydration, if we have a stored user set loading:false immediately
      onRehydrateStorage: () => (state) => {
        if (state?.user) state.loading = false
      },
    }
  )
)
