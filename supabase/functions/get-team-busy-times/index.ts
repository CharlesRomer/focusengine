// Edge Function: get-team-busy-times
// POST (authenticated) — returns ONLY busy time ranges for team members' calendars
// Never returns event titles or details
// Body: { date: string }  (ISO date, e.g. "2026-03-28")
// Returns: { [userId: string]: Array<{ start: string, end: string }> }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getValidAccessToken(
  serviceClient: ReturnType<typeof createClient>,
  memberId: string,
  accessToken: string,
  refreshToken: string | null,
  tokenExpiry: string | null
): Promise<string | null> {
  const expiry = tokenExpiry ? new Date(tokenExpiry) : null
  if (!expiry || expiry.getTime() > Date.now() + 60_000) {
    return accessToken
  }
  if (!refreshToken) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      grant_type:    'refresh_token',
    }),
  })

  if (!res.ok) {
    console.error('[get-team-busy-times] refresh failed for', memberId, await res.text())
    return null
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  const newExpiry = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString()
  await serviceClient.from('users').update({
    google_access_token: data.access_token,
    google_token_expiry: newExpiry,
  }).eq('id', memberId)

  return data.access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({}), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get requesting user's team_org_id
    const { data: requester } = await serviceClient
      .from('users')
      .select('team_org_id')
      .eq('id', user.id)
      .single()

    if (!requester?.team_org_id) {
      return new Response(JSON.stringify({}), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { date } = await req.json() as { date: string }

    // Fetch all OTHER connected team members
    const { data: members } = await serviceClient
      .from('users')
      .select('id, google_access_token, google_refresh_token, google_token_expiry')
      .eq('team_org_id', requester.team_org_id)
      .eq('google_calendar_connected', true)
      .neq('id', user.id)

    if (!members || members.length === 0) {
      return new Response(JSON.stringify({}), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const timeMin = `${date}T00:00:00Z`
    const timeMax = `${date}T23:59:59Z`

    const result: Record<string, Array<{ start: string; end: string }>> = {}

    await Promise.all(members.map(async (member) => {
      try {
        const accessToken = await getValidAccessToken(
          serviceClient,
          member.id,
          member.google_access_token,
          member.google_refresh_token,
          member.google_token_expiry
        )
        if (!accessToken) return

        const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
          method: 'POST',
          headers: {
            Authorization:  `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            timeMin,
            timeMax,
            items: [{ id: 'primary' }],
          }),
        })

        if (!res.ok) {
          console.error('[get-team-busy-times] freebusy failed for', member.id, await res.text())
          return
        }

        const data = await res.json() as {
          calendars: { primary: { busy: Array<{ start: string; end: string }> } }
        }
        // Only return time ranges — NEVER titles or event details
        result[member.id] = data.calendars?.primary?.busy ?? []
      } catch (err) {
        console.error('[get-team-busy-times] error for member', member.id, err)
        // Skip this member silently
      }
    }))

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[get-team-busy-times] unexpected error', err)
    return new Response(JSON.stringify({}), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
