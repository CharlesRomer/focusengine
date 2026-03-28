// Edge Function: get-calendar-events
// POST (authenticated) — fetches the current user's Google Calendar events
// Body: { date_min: string, date_max: string }  (ISO datetime strings)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function refreshAccessToken(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  refreshToken: string
): Promise<string | null> {
  const clientId     = Deno.env.get('GOOGLE_CLIENT_ID')!
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    'refresh_token',
    }),
  })

  if (!res.ok) {
    console.error('[get-calendar-events] refresh failed', await res.text())
    return null
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  const expiry = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString()

  await serviceClient.from('users').update({
    google_access_token: data.access_token,
    google_token_expiry: expiry,
  }).eq('id', userId)

  return data.access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get authenticated user
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch user's google tokens
    const { data: userData } = await serviceClient
      .from('users')
      .select('google_access_token, google_refresh_token, google_token_expiry, google_calendar_connected')
      .eq('id', user.id)
      .single()

    if (!userData?.google_calendar_connected || !userData.google_access_token) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { date_min, date_max } = await req.json() as { date_min: string; date_max: string }

    // Refresh token if expired (with 60s buffer)
    let accessToken = userData.google_access_token
    const expiry = userData.google_token_expiry ? new Date(userData.google_token_expiry) : null
    if (expiry && expiry.getTime() < Date.now() + 60_000) {
      if (!userData.google_refresh_token) {
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const refreshed = await refreshAccessToken(serviceClient, user.id, userData.google_refresh_token)
      if (!refreshed) {
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      accessToken = refreshed
    }

    // Fetch events from Google Calendar API
    const params = new URLSearchParams({
      timeMin:      date_min,
      timeMax:      date_max,
      singleEvents: 'true',
      orderBy:      'startTime',
      maxResults:   '100',
    })
    const gcalRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!gcalRes.ok) {
      console.error('[get-calendar-events] gcal fetch failed', await gcalRes.text())
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const gcalData = await gcalRes.json() as {
      items: Array<{
        id: string
        summary?: string
        start: { dateTime?: string; date?: string }
        end:   { dateTime?: string; date?: string }
      }>
    }

    const events = (gcalData.items ?? []).map(e => ({
      id:       e.id,
      summary:  e.summary || 'No title',
      start:    e.start.dateTime || e.start.date || '',
      end:      e.end.dateTime   || e.end.date   || '',
      isAllDay: !e.start.dateTime,
    }))

    return new Response(JSON.stringify(events), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[get-calendar-events] unexpected error', err)
    return new Response(JSON.stringify([]), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
