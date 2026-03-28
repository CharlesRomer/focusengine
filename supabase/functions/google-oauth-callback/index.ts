// Edge Function: google-oauth-callback
// POST (no JWT required) — called by React /auth/google/callback page
// Exchanges the OAuth code for tokens and stores them server-side.
// Deployed with --no-verify-jwt because after Google's redirect, the Supabase
// auth session may not yet be restored in localStorage when this is called.
// Security is maintained by the single-use OAuth code + state = userId check.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { code, state } = await req.json() as { code: string; state: string }
    if (!code || !state) {
      return new Response(JSON.stringify({ error: 'Missing code or state' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // state = userId (set when building the OAuth URL)
    // Verify the user actually exists in our DB before storing tokens
    const userId = state
    const { data: existingUser, error: userLookupError } = await serviceClient
      .from('users')
      .select('id')
      .eq('id', userId)
      .single()

    if (userLookupError || !existingUser) {
      console.error('[google-oauth-callback] userId from state not found in DB:', userId)
      return new Response(JSON.stringify({ error: 'Invalid state — user not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const clientId     = Deno.env.get('GOOGLE_CLIENT_ID')!
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!
    const appUrl       = Deno.env.get('APP_URL')!
    const redirectUri  = `${appUrl}/auth/google/callback`

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const body = await tokenRes.text()
      console.error('[google-oauth-callback] token exchange failed', body)
      return new Response(JSON.stringify({ error: 'Token exchange failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const tokens = await tokenRes.json() as {
      access_token:  string
      refresh_token: string
      expires_in:    number
    }

    const expiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()
    const { error: updateError } = await serviceClient
      .from('users')
      .update({
        google_access_token:      tokens.access_token,
        google_refresh_token:     tokens.refresh_token,
        google_token_expiry:      expiry,
        google_calendar_connected: true,
      })
      .eq('id', userId)

    if (updateError) {
      console.error('[google-oauth-callback] db update failed', updateError)
      return new Response(JSON.stringify({ error: 'Could not save tokens' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[google-oauth-callback] unexpected error', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
