# Compass — Claude Instructions

## Read first, always
Before doing anything, check:
1. `plan.md` — current milestone, objective, constraints, risks
2. `tasks.md` — what's in progress, what's blocked, what's done

## Working rules
- **Do not start coding before confirming the current task from `tasks.md`**
- One task at a time. Mark it `in progress` before starting, `done` when complete.
- Update `notes.md` when you discover something non-obvious (bugs, gotchas, decisions)
- Update `plan.md` when the milestone, constraints, or affected files change
- Keep all three files concise. No filler. Delete stale entries.

---

## What is Compass

Compass is a focus and productivity tool built for small agency teams (5–20 people). It combines personal daily planning (commitments, focus sessions, time tracking) with a team visibility layer (live pulse, execution rate, weekly AI digest). The core loop is: set commitments each morning → start named focus sessions → the macOS agent tracks which apps you use → end the session with an output note and app classification → see your focus score and team's execution rate. The product runs as a web app (desktop-only) with a companion macOS menu bar agent that does the actual app tracking.

---

## Tech stack

| Layer | Technology | Version |
|---|---|---|
| Frontend framework | React | 18.3.1 |
| Language | TypeScript | 5.6.3 |
| Build tool | Vite | 5.4.11 |
| Styling | Tailwind CSS | 3.4.14 |
| Server state | TanStack Query | 5.60.0 |
| Client state | Zustand | 5.0.12 |
| Routing | React Router | 6.27.0 |
| Calendar | FullCalendar | 6.1.20 |
| Charts | Recharts | 2.13.0 |
| Date utils | date-fns | 4.1.0 |
| Backend / DB | Supabase | 2.45.0 (JS client) |
| macOS agent | Swift (macOS 13+) | — |
| Auto-update | Sparkle | 2.9+ (SPM) |
| Deployment | Vercel | — |

---

## Deployment

- **Live URL**: https://focusengine-one.vercel.app
- **GitHub repo**: CharlesRomer/focusengine (main branch auto-deploys to Vercel)
- **Vercel project**: focusengine-one
- **`public/` is served at the root URL** — `appcast.xml` and `CompassTracker.zip` live here and are served directly by Vercel

---

## Database (Supabase)

The Supabase project URL is in `.env` (`VITE_SUPABASE_URL`). Never commit `.env`.

### Key tables

| Table | Purpose |
|---|---|
| `users` | One row per user. Holds `display_name`, `team_org_id`, `role`, `agent_token`, `active_session_id`, `avatar_color`, `google_calendar_connected` |
| `teams` | One row per team. `team_code` is the join code shown to members |
| `commitments` | Daily commitments per user. `date` is YYYY-MM-DD. Soft-deleted via `deleted_at`. `proof_url` is required to mark done |
| `focus_sessions` | Named focus sessions. `status` ∈ `active/paused/ended`. `focus_score` written on end. `is_unplanned` bool for sessions started outside of commitments |
| `focus_blocks` | Planned time blocks on the calendar. Can be linked to a commitment via `commitment_id` and to a session via `session_id` |
| `activity_events` | Categorized app usage events sent by the macOS agent. Immutable — never delete. `session_id` links events to the session that was running |
| `app_classifications` | Per-session user classifications of apps as `focused` or `distraction`. Used to compute `focus_score` |
| `quick_captures` | Timestamped free-form notes captured during the day |
| `weekly_digests` | AI-generated weekly summaries. Written by edge function, read-only in UI |

### Team isolation
Every shared table has `team_org_id`. RLS uses two `SECURITY DEFINER` functions:
- `get_my_team_org_id()` — returns calling user's `team_org_id`
- `is_team_admin()` — returns true if calling user has `role = 'admin'`

### Migrations
All migrations are in `supabase/migrations/`. Run them manually in Supabase SQL Editor in order. They are not run automatically.

```
001_initial_schema.sql       — core tables + RLS
002_active_session_id.sql    — users.active_session_id
003_agent_auth.sql           — x-agent-token header auth for macOS agent
004_categorize_trigger.sql   — webhook trigger for categorize-events edge fn
005_simplify_activity.sql    — drop raw_events, agent writes directly to activity_events
006_agent_select_users.sql   — RLS policy for agent to read users table
007_weekly_digests.sql       — weekly_digests table + edge fn support
008_team_pulse_rls.sql       — RLS for team visibility across users
009_google_calendar_columns.sql — google calendar token columns on users
010_app_classifications.sql  — per-session app classification table
011_backfill_session_ids.sql — backfill session_id on existing activity_events
012_unplanned_sessions.sql   — is_unplanned bool on focus_sessions
```

### Edge functions
Located in `supabase/functions/`. Deploy with `supabase functions deploy <name>`.

| Function | Trigger | Purpose |
|---|---|---|
| `categorize-events` | DB webhook on `activity_events INSERT` | Categorizes raw app events into deep_work/meeting/etc |
| `daily-summary` | Cron `0 23 * * *` | Aggregates daily stats |
| `generate-insights` | Manual / Reports page | AI analysis via Claude Haiku |
| `generate-digest` | Manual / Friday | AI weekly digest via Claude Haiku |
| `get-calendar-events` | Client fetch | Proxies Google Calendar API |
| `get-team-busy-times` | Client fetch | Aggregates team calendar availability |
| `google-oauth-callback` | OAuth redirect | Handles Google OAuth flow |
| `google-oauth-url` | Client fetch | Generates Google OAuth URL |

AI calls use `claude-haiku-4-5-20251001`. Requires `ANTHROPIC_API_KEY` set as Supabase secret:
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

---

## macOS Agent — CompassTracker

### Location
`agent/CompassTracker/` — a standalone Xcode project (Swift, macOS 13+)

### How it works
1. Runs as a menu bar app (no Dock icon, `LSUIElement = true`)
2. `TrackerEngine` listens for `NSWorkspace.didActivateApplicationNotification` to detect app switches
3. Every 30s: checks for browser tab URL changes, checks idle state (5-min threshold via `CGEventSource`), polls `users.active_session_id` from Supabase, evaluates notification conditions
4. When an app session ends (switch or idle), sends an `ActivitySession` to `SupabaseClient` which POSTs to `activity_events` via Supabase REST API
5. Auth: uses `agent_token` (UUID stored in Keychain) + `x-agent-token` header. The Supabase RLS policy validates this token against `users.agent_token`
6. Browser URLs: read via AppleScript through `BrowserHelper.swift`. Requires Accessibility permission granted by user
7. Notifications: `NotificationManager` handles 3 notification types with snooze, once-per-day guards, daily cap of 3. Triggered by `evaluateNotifications()` which runs every 30s

### Notification types
| Notification | Trigger | Window |
|---|---|---|
| A — Working without session | 15+ min in work app, no active session, 60-min cooldown | 8am–7pm |
| B — Morning check-in | Activity detected, no commitments set, not yet fired today | 8:30–10am |
| C — End of day | Activity detected, open commitments exist, not yet fired today | 5–6pm |

Work apps: VS Code, Xcode, Figma, Notion, Linear, JetBrains IDEs, browsers. Excluded: Slack, Mail, Messages, Spotify, Finder, Terminal.

UserDefaults keys used by NotificationManager:
- `compassNotifPermissionRequested` — bool, permission asked
- `compassNotifSnoozeUntil` — ISO8601 string, snooze expiry
- `compassNotifDailyCount` — int, notifications fired today
- `compassNotifDailyDate` — ISO8601 string, date of daily count
- `compassLastWorkingNotifTime` — TimeInterval, last Notification A
- `compassMorningCheckInDate` — ISO8601 string, last Notification B date
- `compassEndOfDayDate` — ISO8601 string, last Notification C date

### Swift files
| File | Purpose |
|---|---|
| `AppDelegate.swift` | Menu bar setup, menu rebuild, notification category registration, response handling, debug menu items |
| `TrackerEngine.swift` | Core tracking loop, app switches, idle detection, notification evaluation |
| `SupabaseClient.swift` | REST calls to Supabase (send activity, fetch active_session_id, query commitments) |
| `NotificationManager.swift` | Schedule/snooze/cap logic for all 3 notification types |
| `BrowserHelper.swift` | AppleScript to read active tab URL/title from Chrome/Safari/Firefox/Edge |
| `KeychainHelper.swift` | Store and retrieve `TrackerConfig` (supabaseUrl, anonKey, token, userId) from Keychain |
| `SetupView.swift` | SwiftUI onboarding screen (paste agent token) |
| `CompassTrackerApp.swift` | Entry point, wires AppDelegate |

### Current version
- `CFBundleShortVersionString`: 1.3.0
- `CFBundleVersion` (build): 4
- Sparkle public ED key: `1SgNVWD6ei9OuOiTQ1W//nA7wWuXXpCJuF6Bk4Q2mzQ=`
- Sparkle private key: stored in macOS Keychain (never committed)

### Building and deploying (Sparkle auto-update process)

**Every release:**

1. Make code changes, bump `Info.plist`:
   - `CFBundleShortVersionString` → new version (e.g. `1.4.0`)
   - `CFBundleVersion` → increment integer (e.g. `5`)

2. In Xcode: **Product → Archive → Distribute App → Copy App** → export to `~/Desktop/CompassTrackerExport/`

3. Zip and sign:
```bash
# Zip (must use ditto — preserves macOS metadata)
ditto -c -k --sequesterRsrc --keepParent \
  ~/Desktop/CompassTrackerExport/CompassTracker.app \
  ~/Desktop/CompassTrackerExport/CompassTracker.zip

# Sign — outputs edSignature and length
/Users/charlesromer/Library/Developer/Xcode/DerivedData/CompassTracker-aqmxllsccvsrbchgaxshwbnwjvuq/SourcePackages/artifacts/sparkle/Sparkle/bin/sign_update \
  ~/Desktop/CompassTrackerExport/CompassTracker.zip
```

4. Copy zip to `public/`:
```bash
cp ~/Desktop/CompassTrackerExport/CompassTracker.zip \
  /Users/charlesromer/Documents/Goshen/FocusEngine/public/CompassTracker.zip
```

5. Update `public/appcast.xml` with new version, build number, edSignature, and length.

6. Commit and push — Vercel deploys automatically. Sparkle polls the appcast URL on existing installs and auto-updates.

**Sparkle key location** (if `sign_update` path changes after DerivedData wipe):
```bash
find ~/Library/Developer/Xcode/DerivedData -name sign_update 2>/dev/null
```

**Appcast URL**: https://focusengine-one.vercel.app/appcast.xml
**Zip URL**: https://focusengine-one.vercel.app/CompassTracker.zip

---

## Screens

### Today (`/today`) — `src/screens/Today.tsx`
The daily command center. Shows:
- **Morning gate** (before 10am, if no commitments set): prompts user to enter today's commitments before seeing anything else. Skippable with "Skip for now →". Triggered by `?action=set-commitments` URL param or `forceGate` router state from macOS notification tap.
- **Commitments list**: today's commitments with status, proof upload gate (cannot mark done without proof URL or image), incomplete reason on failure.
- **Quick capture**: text input that appends timestamped notes. Captured items appear as a list below.
- **EOD triage modal**: at end of day, surfaces unplanned sessions for review ("Add as completed" / "Note it and move on").

### Calendar (`/calendar`) — `src/screens/Calendar.tsx`
FullCalendar-based day/week/month view. Shows:
- Focus blocks (planned work slots) — draggable onto the calendar from the sidebar commitment list
- Focus sessions (actual sessions) as background events
- Activity events as colored 15-min blocks (deep_work = purple, meeting = blue, comms = orange, off_task = red, idle = dark)
- Google Calendar events as blue italic read-only events
- Team calendar tab showing all teammates' sessions side by side

FullCalendar is used instead of a custom calendar because it handles drag-to-create, drag-to-move, multi-resource views (team calendar), and timezone-aware event rendering out of the box. Building this from scratch would be weeks of work.

### Team Pulse (`/team`) — `src/screens/TeamPulse.tsx`
Live team status page. Shows:
- Status strip: all team members with their current session or "offline"
- Member cards: each person's active session, today's commitments, execution rate, ⚡ badge on unplanned sessions
- Today's commitments summary across the team
- Weekly execution rate chart

Uses Supabase Realtime (`postgres_changes`) on `focus_sessions`, `commitments`, and `activity_events` tables with a single channel `team-pulse-{teamOrgId}`. Realtime is used here (not polling) because the whole point is live status — 30s polling would feel dead. Channel is cleaned up on unmount.

### Reports (`/reports`) — `src/screens/Reports.tsx`
Analytics for the individual and team. Includes:
- Sessions card: list of past sessions with focus scores, ⚡ badge for unplanned sessions
- Activity breakdown chart (category distribution over time)
- Best focus windows heatmap (30-day fixed window, uses `USER_TIMEZONE` constant in `src/lib/reports.ts` — currently `'America/Los_Angeles'`)
- Weekly digest card with AI-generated summary
- Team execution table (admin only)
- AI insights panel

### Settings (`/settings`) — `src/screens/Settings.tsx`
User profile (display name, avatar), team management, Google Calendar connection, agent token display.

### Download (`/download`) — `src/screens/Download.tsx`
Landing page for macOS agent download. Links to `CompassTracker.zip`.

### Guide (`/guide`) — `src/screens/Guide.tsx`
Onboarding guide / help page.

### Auth (`/auth`) — `src/screens/Auth.tsx`
Sign in / sign up. Email + password only. Email confirmation is disabled in Supabase (would break RLS on first sign-in — auth.uid() returns null until confirmed).

---

## Shared components

| Component | Purpose |
|---|---|
| `SessionTopBar` | Persistent top bar during active sessions. Shows session name, timer, pause/resume, end session. End session triggers 3-step modal: output note → app classification → reveal score. Critical fix: guard is `if (!session || (session.status === 'ended' && !showEnd)) return null` — prevents unmount before reveal step fires after Supabase realtime updates status to 'ended' |
| `StartSessionModal` | Start session flow. Includes `plan-check` step that asks if work is planned — "No" sets `is_unplanned: true`. Also shows block picker if unlinked focus blocks exist for today |
| `Sidebar` | Left nav. Shows user name, team name, nav links, keyboard shortcut hint |
| `QuickCapturePopover` | Global ⌘K quick capture popover |
| `ShortcutsOverlay` | Keyboard shortcuts reference overlay (⌘/) |
| `Toast` | Toast notification system. `toast(msg, type)` from `src/store/ui.ts` |
| `OfflineBanner` | Appears when `navigator.onLine` is false |
| `ErrorBoundary` | Wraps all screens to catch render errors |
| `SessionDetailPanel` | Slide-in panel showing session details, activity timeline, and focus score breakdown |

---

## Key architectural decisions

### Why Zustand for auth, TanStack Query for server state
Zustand (with localStorage persistence) for auth means the user isn't signed out on page refresh and the app renders immediately without a loading flash. TanStack Query handles all Supabase data fetching with caching, stale-while-revalidate, and retry logic. No Redux — too much boilerplate for this scale.

### Why Realtime for Team Pulse (not polling)
Team Pulse is a live presence feature. Polling every 30s would feel like a status page, not a live view. Realtime postgres_changes gives instant updates when anyone starts/ends a session. One channel, three subscriptions, cleaned up on unmount.

### Why FullCalendar
Building a drag-to-create, drag-to-move, multi-resource timegrid from scratch is a 2–3 week project. FullCalendar provides all of this with a solid API. The tradeoff is a large bundle size (~400KB gzipped contribution) and opinionated CSS that requires overrides in `src/index.css`.

### Why `activity_events` directly (not raw_events)
Originally the agent wrote to `raw_events` and an edge function categorized them. Migration 005 removed this indirection — the agent now writes directly to `activity_events` with category already set (or `untracked`). `raw_events` is deprecated. Never delete `activity_events` rows — they're immutable by design and the source of truth for all reporting.

### Why no optimistic UI for sessions/activity
Focus sessions and activity events are the product's source of truth for scoring and reporting. If an optimistic update desynchronizes with the server, scores become wrong in ways that are hard to debug. We wait for server confirmation on: session start, session end, activity events, proof uploads, user settings.

### Why `active_session_id` on the users table
The macOS agent needs to know what session is running so it can tag activity events with `session_id`. Polling a separate sessions query every 30s would require the agent to do a join. Storing it denormalized on `users` makes the agent's 30s poll trivial — one row, one column.

### SELECT-after-INSERT RLS trap
`.insert().select().single()` runs the SELECT policy against the new row. If SELECT policy uses `get_my_team_org_id()` and `team_org_id` hasn't been set yet, it returns 0 rows and PostgREST surfaces it as an error. Fix pattern: generate UUID client-side, call `.insert()` without `.select()`, do a separate query if you need data back. See `notes.md` for full details.

### Agent auth via `x-agent-token`
The macOS agent doesn't use Supabase's user auth (no JWT refresh logic in Swift). Instead it uses a static UUID `agent_token` stored in Keychain and sent as `x-agent-token`. A Supabase RLS policy validates `request.header('x-agent-token') = users.agent_token`.

---

## Design system

All values come from CSS variables in `src/index.css`. **Never use arbitrary Tailwind values or hardcoded hex colors.**

### Colors
```css
/* Backgrounds */
--bg-base:      #0D0D0F   /* page background */
--bg-surface:   #141417   /* cards, panels */
--bg-elevated:  #1C1C21   /* modals, dropdowns */
--bg-hover:     #22222A   /* hover state */
--bg-active:    #2A2A35   /* active/selected state */

/* Borders */
--border-subtle:  rgba(255,255,255,0.06)
--border-default: rgba(255,255,255,0.10)
--border-strong:  rgba(255,255,255,0.18)

/* Text */
--text-primary:   #F0EFE8
--text-secondary: #9B9A94
--text-tertiary:  #5C5B57
--text-disabled:  #3D3C39

/* Accent */
--accent:        #7C6FE0   /* purple — primary CTA */
--accent-hover:  #9183F0
--accent-subtle: rgba(124,111,224,0.12)

/* Semantic */
--success: #3DB87A
--warning: #E0A052
--danger:  #D95C5C
--info:    #5A9FE0

/* Activity categories */
--cat-deep:    #7C6FE0   /* deep work */
--cat-meeting: #5A9FE0   /* meetings */
--cat-comms:   #E0A052   /* communications */
--cat-offtask: #D95C5C   /* off task */
--cat-idle:    #2A2A35   /* idle */
```

### Typography
```css
--font-sans: 'Inter', system-ui, sans-serif
--text-xs:   11px
--text-sm:   13px
--text-base: 15px
--text-lg:   18px
--text-xl:   24px
--text-2xl:  32px
```
**Never use font-weight 700 or above.**

### Spacing
```css
--space-1: 4px  --space-2: 8px   --space-3: 12px  --space-4: 16px
--space-5: 20px --space-6: 24px  --space-8: 32px  --space-10: 40px
--space-12: 48px --space-16: 64px
```

### Border radius
```css
--radius-sm: 4px  --radius-md: 8px  --radius-lg: 12px
--radius-xl: 16px --radius-full: 9999px
```

### Shadows
```css
--shadow-sm: 0 1px 2px rgba(0,0,0,0.4)
--shadow-md: 0 4px 12px rgba(0,0,0,0.5)
--shadow-lg: 0 8px 24px rgba(0,0,0,0.6)
```

---

## Coding conventions

- **Path alias**: `@/` maps to `src/`. Always use `@/` imports, never relative `../../`.
- **Component files**: PascalCase `.tsx`. Hook files: camelCase prefixed with `use`, `.ts` extension.
- **No barrel index files**: import directly from the file.
- **Mutations**: always through TanStack Query `useMutation`. On error: log to console, show toast, retain user input. Never swallow errors silently.
- **Timestamps**: store UTC in Supabase, convert to local only at display layer using `date-fns`. Never store local time.
- **Types**: DB types are in `src/lib/supabase.ts` prefixed with `DB` (e.g. `DBFocusSession`). UI-layer types defined in the hook or component that needs them.
- **State**: Zustand for client-only state (auth user, active session, UI flags). TanStack Query for all data that comes from Supabase. Don't put server data in Zustand.
- **No optimistic UI** for: focus sessions, activity events, proof uploads, user settings.
- **Desktop only**: min-width 1024px. Don't add responsive/mobile breakpoints.
- **Error handling**: all Supabase calls must handle `.error`. Pattern: `const { data, error } = await supabase...; if (error) { console.error(error); toast('...', 'error'); return; }`.
- **Tailwind**: use design token CSS vars via `style={{ color: 'var(--text-secondary)' }}` or define utility classes. Don't use arbitrary values like `text-[13px]` — use `--text-sm`.

---

## What's built and confirmed working

- ✅ Auth (sign in, sign up, persist across refresh, team setup flow)
- ✅ Today screen — commitments (add, mark done with proof, mark incomplete with reason), quick capture
- ✅ Calendar — day/week/month views, focus blocks, activity events, drag-to-create blocks, Google Calendar integration, team calendar tab
- ✅ Focus sessions — start modal (with plan-check step), top bar (timer, pause/resume), end modal (output note → app classification → focus score reveal), session restore on page load
- ✅ Activity tracking — macOS agent writes to `activity_events` with `session_id` tagging
- ✅ Team Pulse — live status, member cards, today's commitments summary, execution rate
- ✅ Reports — session list, activity breakdown, focus windows heatmap, weekly digest, AI insights
- ✅ Settings — display name, avatar, team management, Google Calendar, agent token
- ✅ macOS agent (CompassTracker v1.3.0) — app tracking, idle detection, browser URL tracking, notifications (3 types), Sparkle auto-update, debug menu items (Test Notification, Notification Status)
- ✅ Unplanned work tagging — `is_unplanned` on `focus_sessions`, ⚡ in TeamPulse + Reports, EOD triage modal, morning gate on Today screen
- ✅ URL action params — `?action=start-session`, `?action=set-commitments`, `?action=end-of-day` (for macOS notification taps)

---

## Planned but not yet built

- ⬜ **Streak counter** — consecutive days with ≥1 completed commitment. Display on Today screen and Team Pulse member cards.
- ⬜ **Blocker flag** — mark a commitment as blocked, surface blockers in team view for async standup.
- ⬜ **Teammate reactions** — emoji reactions on completed commitments visible in Team Pulse feed.
- ⬜ **Agent health warning** — if no activity events received in 24h, show a warning banner in the web app. Detect via `MAX(ended_at)` on `activity_events` for the user.
- ⬜ **Session history on Today screen** — compact list of today's ended sessions below commitments, with duration and focus score.
- ⬜ **Keyboard shortcuts** — full coverage: ⌘N new session, ⌘. end session, ⌘K quick capture (partially done via ShortcutsOverlay), etc.
- ⬜ **Error boundaries per screen** — currently one global ErrorBoundary; should be per-screen so one crash doesn't kill the whole app.
- ⬜ **Settings — notification preferences** — let users configure notification windows and daily cap from the web app (write to `users` table, read by agent).

---

## Known issues and quirks

- **SessionTopBar unmount race**: when `commitSession` sets `status='ended'` in DB, Supabase Realtime fires immediately. The guard must be `if (!session || (session.status === 'ended' && !showEnd)) return null` — if you change it to `if (session.status === 'ended') return null`, the reveal step never shows.

- **Supabase SELECT-after-INSERT**: see Architecture section. Always generate UUIDs client-side on inserts where the SELECT policy depends on data not yet available.

- **Email confirmation must be disabled**: Supabase → Auth → Settings → disable email confirmation. If enabled, `auth.uid()` returns null after signup until email is confirmed, causing all RLS checks to fail silently.

- **FullCalendar CSS conflicts**: FullCalendar ships its own CSS. All overrides live at the bottom of `src/index.css`. Don't fight FC's cascade — use specificity (`.fc .fc-button` etc.) rather than `!important` where possible.

- **project.pbxproj must be updated manually when adding Swift files**: Xcode does this automatically when you add files via the GUI, but if files are added programmatically (e.g. by Claude), they won't appear in the build unless added to `PBXBuildFile`, `PBXFileReference`, the `PBXGroup` children array, and `PBXSourcesBuildPhase`. The `NotificationManager.swift` entry uses UUID `AA00000000000000000000BB` (fileRef) and `AA00000000000000000000AA` (build file).

- **Sparkle DerivedData path**: the `sign_update` binary lives inside DerivedData at a hash-based path. If DerivedData is wiped, run `find ~/Library/Developer/Xcode/DerivedData -name sign_update` to find the new path.

- **BestFocusWindowsCard timezone**: hardcoded to `'America/Los_Angeles'` in `src/lib/reports.ts`. Change the `USER_TIMEZONE` constant to match the user's timezone.

- **`weekly_digests` uses service role**: edge functions that write digests must use `SUPABASE_SERVICE_ROLE_KEY`, not the anon key. RLS on `weekly_digests` allows service role writes only.

- **Team Pulse soft-deleted commitments**: shown as incomplete (no reason text) by design. The query does NOT filter `deleted_at IS NULL` for team pulse view — per spec.

- **Avatar color is deterministic**: computed from `user_id` character codes: `hsl(sum % 360, 45%, 38%)`. Consistent across sessions. Defined in `src/lib/avatar.ts`.

---

## Local development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
# → http://localhost:5173

# Type-check + build (run before committing)
npm run build

# Claude with all permissions bypassed (this repo only)
./cc-yolo
```

### Environment variables
Create `.env` at project root (never commit this):
```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

### Running migrations
All migrations are manual — paste the SQL into the Supabase SQL Editor and run in order. See `supabase/migrations/` and `notes.md` for full setup steps including storage bucket creation and edge function deployment.
