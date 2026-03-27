import { useEffect } from 'react'
import { supabase, type DBUser } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'

export function useAuth() {
  const { user, loading, setUser, setLoading } = useAuthStore()

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION immediately on mount with the
    // stored session (if any). Because the auth store is persisted, user is
    // already hydrated from localStorage — so this just re-validates it.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const profile = await fetchProfile(session.user.id)
          // Only update store if we got a real profile — never clear on a slow/failed fetch
          if (profile) setUser(profile)
        } else if (event === 'SIGNED_OUT') {
          // Only clear user on an explicit sign-out event
          setUser(null)
        }
        setLoading(false)
      }
    )

    // Safety: clear loading after 4s even if listener never fires
    const t = setTimeout(() => setLoading(false), 4000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(t)
    }
  }, [])

  return { user, loading }
}

async function fetchProfile(userId: string): Promise<DBUser | null> {
  const timeout = new Promise<null>(r => setTimeout(() => r(null), 5000))
  const query = supabase
    .from('users').select('*').eq('id', userId).single()
    .then(({ data }) => data as DBUser | null, () => null)
  return Promise.race([query, timeout])
}
