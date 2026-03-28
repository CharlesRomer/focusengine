import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MemberSummary {
  name: string
  score: number | null
  sessions: number
  deepWorkHours: string
  executionRate: number
}

interface InsightsRequest {
  teamOrgId: string
  windowStart: string
  windowEnd: string
  rows: MemberSummary[]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body: InsightsRequest = await req.json()
    const { rows, windowStart, windowEnd } = body

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const start = new Date(windowStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const end = new Date(windowEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    const tableLines = rows.map(
      (r) =>
        `- ${r.name}: avg score ${r.score ?? 'n/a'}, ${r.sessions} sessions, ${r.deepWorkHours}h deep work, ${r.executionRate}% execution`
    )

    const prompt = `You are an executive coach analyzing a small agency team's productivity data for the period ${start}–${end}.

Team data:
${tableLines.join('\n')}

Write 3–4 bullet-point insights about patterns you notice. Be specific and actionable. Keep each bullet under 2 sentences. Focus on: who's doing well, who may need support, team-wide patterns, and one concrete suggestion.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Anthropic API error: ${err}`)
    }

    const data = await response.json()
    const insights: string = data.content?.[0]?.text ?? ''

    return new Response(JSON.stringify({ insights }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
