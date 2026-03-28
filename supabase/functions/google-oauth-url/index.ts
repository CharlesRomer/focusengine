// Edge Function: google-oauth-url
// POST — accepts { userId } from the client, returns { url: string }
// No JWT auth needed here — just builds the Google OAuth URL.
// Security is enforced in google-oauth-callback (state/JWT match).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId } = await req.json() as { userId?: string }
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing userId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const clientId    = Deno.env.get('GOOGLE_CLIENT_ID')!
    const appUrl      = Deno.env.get('APP_URL')!
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
    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[google-oauth-url]', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
