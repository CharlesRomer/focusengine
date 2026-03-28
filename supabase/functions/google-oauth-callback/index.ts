// Edge Function: google-oauth-callback
// POST (authenticated) — called by React /auth/google/callback page
// Exchanges the OAuth code for tokens and stores them server-side

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
    // Verify the caller is authenticated and get their user ID
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { code, state } = await req.json() as { code: string; state: string }
    if (!code || !state) {
      return new Response(JSON.stringify({ error: 'Missing code or state' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify state matches authenticated user (prevents CSRF)
    if (state !== user.id) {
      console.error('[google-oauth-callback] state mismatch', { state, userId: user.id })
      return new Response(JSON.stringify({ error: 'State mismatch' }), {
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
      .eq('id', user.id)

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
