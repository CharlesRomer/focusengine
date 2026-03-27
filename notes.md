# Compass — Notes

## Architecture

- **Auth flow**: Supabase auth → `onAuthStateChange` fires INITIAL_SESSION → fetch profile from `users` table → Zustand store (persisted to localStorage)
- **Write pattern**: all mutations go through TanStack Query `useMutation`. Optimistic updates only on commitment status changes. Everything else waits for server confirmation.
- **Team isolation**: `team_org_id` on every shared table. RLS helpers: `get_my_team_org_id()` + `is_team_admin()` (both `SECURITY DEFINER` functions).
- **No Redux**: Zustand for client-only state (auth, UI). TanStack Query for all server state.

## Supabase gotchas

- **SELECT-after-INSERT RLS trap**: `.insert().select().single()` runs the SELECT policy against the newly inserted row. If the SELECT policy uses `get_my_team_org_id()` and `team_org_id` is null at that moment, it returns 0 rows and PostgREST surfaces it as an RLS violation. Fix: generate UUID client-side, skip `.select()`, do a separate query if you need the data back.
- **INSERT policy vs SELECT policy**: INSERT `WITH CHECK` runs on the proposed new row. SELECT `USING` runs on existing rows being read. They're separate — a row can pass INSERT but be invisible on SELECT.
- **Teams SELECT policy** needs `OR created_by = auth.uid()` so creators can see their team immediately after creation (before `team_org_id` is set on the user).
- **Email confirmation**: if enabled, `signUp()` returns `{ user, session: null }`. All subsequent RLS checks fail silently (auth.uid() = null). Disable in Supabase > Auth > Settings for v1.
- **`users` table FK**: `teams.created_by` references `users.id`. Must insert user row before team row.

## React / Vite gotchas

- **StrictMode double-effect**: `useEffect` runs twice in dev. Auth subscription must not have side effects that break on second run. Zustand persist solves the "user lost on remount" issue.
- **`onAuthStateChange` + StrictMode**: First subscription gets INITIAL_SESSION. After cleanup + remount, second subscription may not get INITIAL_SESSION again. Persisted user in Zustand means it doesn't matter.

## Commands that work

```bash
npm run dev          # start dev server (http://localhost:5173)
npm run build        # tsc + vite build — use this to verify no TS errors
./cc-yolo            # launch Claude with all permissions bypassed (this repo only)
```

## Supabase manual steps required

1. Run `supabase/migrations/001_initial_schema.sql` in SQL Editor
2. Add `commitment_id` FK to `focus_blocks` (needed for drag-to-schedule + calendar icon):
   ```sql
   ALTER TABLE focus_blocks
     ADD COLUMN IF NOT EXISTS commitment_id uuid REFERENCES commitments(id) ON DELETE SET NULL;
   ```
2. Fix teams SELECT policy:
   ```sql
   drop policy "teams: select own team" on teams;
   create policy "teams: select own team" on teams
     for select using (id = get_my_team_org_id() OR created_by = auth.uid());
   ```
3. Create proof-uploads storage bucket:
   ```sql
   insert into storage.buckets (id, name, public) values ('proof-uploads', 'proof-uploads', true);
   create policy "users can upload proof" on storage.objects for insert
     with check (bucket_id = 'proof-uploads' and auth.uid()::text = (storage.foldername(name))[1]);
   create policy "proof images are public" on storage.objects for select
     using (bucket_id = 'proof-uploads');
   ```

4. Run `supabase/migrations/002_active_session_id.sql` in SQL Editor — adds `users.active_session_id` column used by macOS agent to know current session.

5. Deploy Edge Functions:
   ```bash
   supabase functions deploy categorize-events
   supabase functions deploy daily-summary
   ```
   Then create a Database Webhook: Table `raw_events`, Event `INSERT`, URL = `https://<project>.supabase.co/functions/v1/categorize-events`.

6. Set daily-summary cron in Supabase Dashboard → Database → Cron Jobs:
   `0 23 * * *` → POST `https://<project>.supabase.co/functions/v1/daily-summary`

## Phase 5 notes

- **active_session_id flow**: web app writes `users.active_session_id` on session start (StartSessionModal + FocusCalendar) and clears it on end (SessionTopBar). Agent polls this every 30s and tags raw_events with session_id.
- **Focus score**: `computeFocusScore` returns `null` when no activity_events exist (honest signal). Live score updates every 60s by fetching real activity_events. Final score on end also uses real data.
- **Block picker flow**: StartSessionModal queries today's unlinked focus_blocks on open. If found, shows card picker first. Selecting a block links `focus_blocks.session_id = session.id` after insert.

## Pitfalls to avoid

- Don't use `.select()` after INSERT on tables where the SELECT policy depends on data that hasn't been set yet
- Don't store local time in Supabase — always UTC, convert at display layer
- Don't use optimistic UI for focus sessions, activity events, proof uploads, or user settings (per spec)
- Don't delete raw_events — they're immutable by design
