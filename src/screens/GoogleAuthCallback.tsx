// Google OAuth callback page
// Google redirects here after the user grants calendar access.
// This page passes the code to the edge function (which holds the client secret),
// then navigates to Settings with a success/error toast param.

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export function GoogleAuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code  = params.get('code')
    const state = params.get('state')
    const error = params.get('error')

    if (error || !code || !state) {
      navigate('/settings?gcal=error', { replace: true })
      return
    }

    supabase.functions
      .invoke('google-oauth-callback', { body: { code, state } })
      .then(({ error: fnErr }) => {
        if (fnErr) {
          console.error('[GoogleAuthCallback]', fnErr)
          navigate('/settings?gcal=error', { replace: true })
        } else {
          navigate('/settings?gcal=connected', { replace: true })
        }
      })
  }, [navigate])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'var(--bg-base)',
      color: 'var(--text-secondary)',
      fontSize: 14,
      fontFamily: 'var(--font-sans)',
    }}>
      Connecting Google Calendar…
    </div>
  )
}
