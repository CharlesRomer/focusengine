// Supabase Edge Function: compute daily summaries (cron: nightly at 11pm)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const date = yesterday.toISOString().split('T')[0]

  // Get all activity_events for yesterday grouped by user
  const { data: events } = await supabase
    .from('activity_events')
    .select('user_id, team_org_id, category, duration_seconds, session_id')
    .gte('started_at', date + 'T00:00:00Z')
    .lt('started_at', date + 'T23:59:59Z')

  if (!events || events.length === 0) return new Response('No events', { status: 200 })

  // Group by user
  const byUser: Record<string, typeof events> = {}
  for (const e of events) {
    byUser[e.user_id] = byUser[e.user_id] || []
    byUser[e.user_id].push(e)
  }

  for (const [userId, userEvents] of Object.entries(byUser)) {
    const teamOrgId = userEvents[0].team_org_id
    const summary = {
      user_id: userId,
      team_org_id: teamOrgId,
      date,
      total_tracked_seconds: 0,
      deep_work_seconds: 0,
      meeting_seconds: 0,
      comms_seconds: 0,
      off_task_seconds: 0,
      context_switches: 0,
    }

    let prevCategory = ''
    for (const e of userEvents) {
      const dur = e.duration_seconds ?? 0
      summary.total_tracked_seconds += dur
      if (e.category === 'deep_work') summary.deep_work_seconds += dur
      else if (e.category === 'meeting') summary.meeting_seconds += dur
      else if (e.category === 'communication') summary.comms_seconds += dur
      else if (e.category === 'off_task') summary.off_task_seconds += dur
      if (e.category !== prevCategory && e.category !== 'idle') summary.context_switches++
      prevCategory = e.category
    }

    await supabase.from('daily_summaries').upsert(summary, { onConflict: 'user_id,date' })
  }

  return new Response(JSON.stringify({ ok: true, date }), { status: 200 })
})
