// Edge Function: google-oauth-url
// POST (no JWT required) — builds the Google OAuth URL for the client to redirect to.
// Deployed with --no-verify-jwt since this just builds a URL (no sensitive data).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const appUrl   = Deno.env.get('APP_URL')

    if (!clientId || !appUrl) {
      console.error('[google-oauth-url] missing env vars — GOOGLE_CLIENT_ID:', !!clientId, 'APP_URL:', !!appUrl)
      return new Response(JSON.stringify({ error: 'Server misconfiguration — secrets not set' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let userId: string | undefined
    try {
      const body = await req.json()
      userId = body?.userId
    } catch {
      // Body might be empty — that's fine, userId can also come from query params
    }

    // Fallback: userId from query param
    if (!userId) {
      userId = new URL(req.url).searchParams.get('userId') ?? undefined
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing userId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const redirectUri = `${appUrl}/auth/google/callback`
    const scope       = 'https://www.googleapis.com/auth/calendar.readonly'

    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  redirectUri,
      response_type: 'code',
      scope,
      access_type:   'offline',
      prompt:        'consent',
      state:         userId,
    })

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
    console.log('[google-oauth-url] built URL for userId:', userId.slice(0, 8) + '...')
    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[google-oauth-url] unexpected error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
