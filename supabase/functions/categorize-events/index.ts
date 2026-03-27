// Supabase Edge Function: categorize raw_events into activity_events
// Triggered by raw_events INSERT via database webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DEEP_WORK_BUNDLES = [
  'com.microsoft.VSCode', 'com.apple.Xcode', 'com.figma.Desktop',
  'org.vim.MacVim', 'com.notion.id', 'com.linear.app',
]
const MEETING_BUNDLES = ['us.zoom.xos', 'com.microsoft.teams', 'com.google.Meet', 'com.apple.FaceTime']
const COMMS_BUNDLES = ['com.tinyspeck.slackmacgap', 'com.apple.mail', 'com.microsoft.Outlook', 'com.apple.MobileSMS']

const DEEP_WORK_URLS = ['github.com', 'gitlab.com', 'figma.com', 'notion.so', 'linear.app', 'vercel.com', 'docs.google.com']
const MEETING_URLS = ['meet.google.com', 'zoom.us', 'teams.microsoft.com']
const COMMS_URLS = ['mail.google.com', 'slack.com']
const OFF_TASK_URLS = ['twitter.com', 'x.com', 'instagram.com', 'facebook.com', 'reddit.com', 'youtube.com', 'netflix.com', 'tiktok.com']

function categorize(bundleId: string | null, url: string | null, isIdle: boolean): string {
  if (isIdle) return 'idle'
  if (bundleId) {
    if (DEEP_WORK_BUNDLES.some(b => bundleId.startsWith(b))) return 'deep_work'
    if (MEETING_BUNDLES.includes(bundleId)) return 'meeting'
    if (COMMS_BUNDLES.includes(bundleId)) return 'communication'
  }
  if (url) {
    if (OFF_TASK_URLS.some(u => url.includes(u))) return 'off_task'
    if (MEETING_URLS.some(u => url.includes(u))) return 'meeting'
    if (COMMS_URLS.some(u => url.includes(u))) return 'communication'
    if (DEEP_WORK_URLS.some(u => url.includes(u))) return 'deep_work'
  }
  return 'untracked'
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const payload = await req.json()
  const event = payload.record

  if (!event) return new Response('No record', { status: 400 })

  // Get user's team_org_id
  const { data: user } = await supabase
    .from('users')
    .select('team_org_id')
    .eq('id', event.user_id)
    .single()

  if (!user?.team_org_id) return new Response('User not in team', { status: 422 })

  const category = categorize(event.bundle_id, event.tab_url, event.is_idle)

  const { error } = await supabase.from('activity_events').insert({
    user_id: event.user_id,
    team_org_id: user.team_org_id,
    raw_event_id: event.id,
    app_name: event.app_name,
    category,
    started_at: event.recorded_at,
    session_id: event.session_id,
  })

  if (error) {
    console.error('Failed to insert activity_event:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true, category }), { status: 200 })
})
