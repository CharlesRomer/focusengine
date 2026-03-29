# Compass — Tasks

## In Progress
- [ ] Verify proof upload to Supabase Storage works end-to-end
- [ ] Run migrations 013 + 014 in Supabase SQL Editor (project board + commitment sub_project_id)
- [ ] Deploy notion-sync edge function (supabase functions deploy notion-sync)
- [ ] Set Notion secrets: supabase secrets set NOTION_TOKEN=... NOTION_DATABASE_ID=...

## Backlog

### Phase 3 — Calendar View
- [ ] Day view: 6am–10pm timeline, 30-min slots
- [ ] Activity blocks: color-coded by category (deep/meeting/comms/offtask/idle)
- [ ] Focus block creation: click slot → name → drag to resize
- [ ] Focus block overlay layer on top of activity blocks
- [ ] Hover tooltip on activity blocks (app name + duration)
- [ ] Click focus block: edit name, tag to project, delete
- [ ] Week view: 7-col grid + summary row (focus hrs, meeting hrs, deep %, switches)
- [ ] Month view: calendar grid + focus score dot per day
- [ ] Click day col header → jumps to day view
- [ ] Empty/loading states for all calendar views
- [ ] Wire CalendarDay into Today screen right panel

### Phase 4 — Focus Sessions
- [ ] Start session (from Today, from Calendar block, ⌘⇧F)
- [ ] Persistent 48px top bar with live timer
- [ ] Pause / Resume (⌘⇧P)
- [ ] End session modal — output note required
- [ ] Session restore on page refresh (check for active session on load)
- [ ] Quick capture during session (⌘K popover)
- [ ] Focus score calculated on end

### Phase 5 — Activity Tracking Integration
- [x] Block picker in StartSessionModal (today's unlinked focus_blocks)
- [x] macOS agent polls active_session_id every 30s (agent/tracker.py)
- [x] Edge Functions: categorize-events + daily-summary
- [x] users.active_session_id — written on session start, cleared on end
- [x] Calendar activity events hover tooltip (app name, category, duration)
- [x] Live + final focus score uses real activity_events data
- [x] Settings > Agent page (status, token, install steps, test connection)
- [ ] Supabase manual steps: run migration 002, deploy edge functions, webhook + cron (notes.md)

### Phase 6 — Team Pulse
- [x] Live status strip (Locked in / Paused / Active / Offline) — Realtime via focus_sessions + activity_events
- [x] Status cards: elapsed timer (60s update), context line (session name or last app)
- [x] Today's commitments grid — all members, your column is interactive
- [x] Mark done / skip / reopen your own commitments from Team Pulse
- [x] Weekly execution section — team rate, 7-day sparkline, per-member table
- [x] Realtime: session starts, commitment updates, activity events — no page refresh
- [x] Solo member banner with Settings link
- [x] Migration 008: team-wide RLS policies (SELECT for all team members)
- [ ] Run migration 008 in Supabase SQL Editor (see notes.md)

### Phase 7 — Reports
- [x] Personal: time breakdown donut chart (Recharts PieChart)
- [x] Personal: focus score trend line (daily avg, reference lines at 50/75)
- [x] Personal: best focus windows heatmap (deep_work intensity, 30-day fixed, USER_TIMEZONE)
- [x] Personal: sessions list (expandable, output note, duration, score)
- [x] Personal: commitments stacked bar + incomplete list
- [x] Personal: top distractions (off_task + communication by app/domain)
- [x] Admin team table (sortable by score/sessions/deepWork/execution)
- [x] AI insights panel (on-demand, calls generate-insights Edge Function)
- [x] Friday digest (on-demand + saved to weekly_digests table)
- [x] Migration 007: weekly_digests table with RLS
- [x] Edge Functions: generate-insights + generate-digest (claude-haiku-4-5)
- [ ] Deploy Edge Functions + set ANTHROPIC_API_KEY secret (see notes.md)

### Phase 8 — Polish
- [ ] Settings screen (profile, team, agent, integrations, danger)
- [ ] All keyboard shortcuts verified
- [ ] Error boundary on every screen
- [ ] Min-width 1024px guard

## Blocked
- Proof image upload: needs `proof-uploads` storage bucket created in Supabase dashboard

## Done
- [x] Project Flow Board (/board) — full feature: projects, department/sub-project/blocker nodes, edges, drag, realtime, side panel, right-click menu, task management, progress rollup, Today integration, Notion edge function
- [x] Supabase schema: all tables, RLS, indexes (migration 001)
- [x] Auth: sign up, sign in, sign out
- [x] Onboarding: 4-step flow (email → name → team create/join)
- [x] Auth persists across page refresh (Zustand persist)
- [x] App shell: sidebar nav, routing, design system tokens
- [x] Today screen layout (left panel + right placeholder)
- [x] Commitments: add (up to 3), mark done + proof upload, mark incomplete + reason
- [x] Optimistic UI for commitment status changes with rollback
- [x] Quick capture: type + Enter, timestamped list, ⌘K focus
- [x] cc-yolo launcher, Claude hooks, planning files
- [x] Fix: team_org_id null guard on commitment creation
- [x] Fix: users without team routed back to team setup step
