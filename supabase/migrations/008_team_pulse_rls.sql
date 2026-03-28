-- ─────────────────────────────────────────────────────────────────
-- Migration 008 — Team Pulse RLS
-- Extend SELECT policies so all team members (not just admins)
-- can read their teammates' data. Required for Team Pulse screen.
-- ─────────────────────────────────────────────────────────────────

-- users: team members can see all users in their team
create policy "team members can view team users"
  on users for select
  using (
    team_org_id is not null
    and team_org_id = get_my_team_org_id()
  );

-- commitments: team members can see all team commitments
create policy "team members can view team commitments"
  on commitments for select
  using (team_org_id = get_my_team_org_id());

-- focus_sessions: team members can see all team sessions
create policy "team members can view team sessions"
  on focus_sessions for select
  using (team_org_id = get_my_team_org_id());

-- activity_events: team members can see all team activity
create policy "team members can view team activity"
  on activity_events for select
  using (team_org_id = get_my_team_org_id());
