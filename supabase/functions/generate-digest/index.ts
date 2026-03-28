import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { teamOrgId } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    // Get week bounds (Mon–Sun of most recent week)
    const now = new Date()
    const dow = now.getDay() === 0 ? 7 : now.getDay() // 1=Mon, 7=Sun
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - (dow - 1))
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    // Fetch members
    const { data: members } = await supabase
      .from('users')
      .select('id, display_name')
      .eq('team_org_id', teamOrgId)

    // Fetch activity for the week
    const { data: activity } = await supabase
      .from('activity_events')
      .select('user_id, category, duration_seconds')
      .eq('team_org_id', teamOrgId)
      .gte('started_at', weekStart.toISOString())
      .lte('started_at', weekEnd.toISOString())
      .not('duration_seconds', 'is', null)

    // Fetch sessions
    const { data: sessions } = await supabase
      .from('focus_sessions')
      .select('user_id, focus_score, name')
      .eq('team_org_id', teamOrgId)
      .eq('status', 'ended')
      .gte('started_at', weekStart.toISOString())
      .lte('started_at', weekEnd.toISOString())

    // Fetch commitments
    const { data: commitments } = await supabase
      .from('commitments')
      .select('user_id, status, text')
      .eq('team_org_id', teamOrgId)
      .gte('date', weekStart.toISOString().slice(0, 10))
      .lte('date', weekEnd.toISOString().slice(0, 10))
      .is('deleted_at', null)

    // Build per-member summary
    const memberLines = (members ?? []).map((m) => {
      const act = (activity ?? []).filter((a) => a.user_id === m.id)
      const deepSec = act.filter((a) => a.category === 'deep_work').reduce((s, a) => s + (a.duration_seconds ?? 0), 0)
      const sess = (sessions ?? []).filter((s) => s.user_id === m.id)
      const scores = sess.map((s) => s.focus_score).filter((sc): sc is number => sc !== null)
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
      const comms = (commitments ?? []).filter((c) => c.user_id === m.id)
      const done = comms.filter((c) => c.status === 'done').length
      const incomplete = comms.filter((c) => c.status === 'incomplete')

      let line = `**${m.display_name}**: ${sess.length} sessions, ${(deepSec / 3600).toFixed(1)}h deep work`
      if (avgScore !== null) line += `, avg score ${avgScore}`
      line += `, ${done}/${comms.length} commitments done`
      if (incomplete.length > 0) {
        const incTitles = incomplete.slice(0, 2).map((c) => c.text).join('; ')
        line += `. Incomplete: ${incTitles}${incomplete.length > 2 ? ` (+${incomplete.length - 2} more)` : ''}`
      }
      return line
    })

    const weekLabel = weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

    const prompt = `Write a brief Friday team digest for the week of ${weekLabel}. Be warm, direct, and encouraging. Use markdown.

Team highlights:
${memberLines.join('\n')}

Structure:
1. One-sentence week summary
2. Wins (2–3 bullets)
3. Watch list (1–2 items — things to address, no blame)
4. Next week focus (1 sentence)`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) throw new Error(`Anthropic API error: ${await response.text()}`)

    const data = await response.json()
    const content: string = data.content?.[0]?.text ?? ''

    // Upsert digest
    await supabase.from('weekly_digests').upsert({
      team_org_id: teamOrgId,
      week_start: weekStart.toISOString().slice(0, 10),
      content,
    })

    return new Response(JSON.stringify({ content }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
