-- ─────────────────────────────────────────────────────────────────
-- Compass — Initial Schema
-- ─────────────────────────────────────────────────────────────────

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── teams ────────────────────────────────────────────────────────
create table teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  team_code    text unique default substr(gen_random_uuid()::text, 1, 8),
  created_by   uuid not null,
  slack_webhook_url text,
  created_at   timestamptz default now()
);

-- ── users ────────────────────────────────────────────────────────
create table users (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  team_org_id  uuid references teams(id),
  role         text not null default 'member' check (role in ('member','admin')),
  avatar_color text,
  agent_token  text unique default substr(gen_random_uuid()::text || gen_random_uuid()::text, 1, 32),
  created_at   timestamptz default now()
);

-- Add FK from teams.created_by to users.id
alter table teams add constraint teams_created_by_fkey 
  foreign key (created_by) references users(id);

-- ── commitments ──────────────────────────────────────────────────
create table commitments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references users(id) not null,
  team_org_id       uuid references teams(id) not null,
  date              date not null,
  text              text not null,
  status            text default 'open' check (status in ('open','done','incomplete')),
  proof_url         text,
  proof_type        text check (proof_type in ('image','url')),
  incomplete_reason text,
  horizon_tag       text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  deleted_at        timestamptz
);

-- ── quick_captures ───────────────────────────────────────────────
create table quick_captures (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references users(id) not null,
  text          text not null,
  commitment_id uuid references commitments(id),
  session_id    uuid, -- FK added after focus_sessions
  created_at    timestamptz default now()
);

-- ── focus_sessions ───────────────────────────────────────────────
create table focus_sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references users(id) not null,
  team_org_id         uuid references teams(id) not null,
  name                text not null,
  status              text default 'active' check (status in ('active','paused','ended')),
  output_note         text,
  focus_score         int,
  share_to_feed       bool default false,
  started_at          timestamptz not null default now(),
  paused_at           timestamptz,
  ended_at            timestamptz,
  total_pause_seconds int default 0
);

-- Add session_id FK to quick_captures
alter table quick_captures add constraint quick_captures_session_id_fkey
  foreign key (session_id) references focus_sessions(id);

-- ── focus_blocks ─────────────────────────────────────────────────
create table focus_blocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) not null,
  name        text not null,
  date        date not null,
  start_time  time not null,
  end_time    time not null,
  horizon_tag text,
  session_id  uuid references focus_sessions(id),
  created_at  timestamptz default now(),
  deleted_at  timestamptz
);

-- ── raw_events (IMMUTABLE) ───────────────────────────────────────
create table raw_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) not null,
  app_name    text,
  bundle_id   text,
  tab_title   text,
  tab_url     text,
  is_idle     bool default false,
  session_id  uuid,
  recorded_at timestamptz not null,
  received_at timestamptz default now()
);

-- ── activity_events ──────────────────────────────────────────────
create table activity_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references users(id) not null,
  team_org_id      uuid references teams(id) not null,
  raw_event_id     uuid references raw_events(id) not null,
  app_name         text,
  category         text check (category in ('deep_work','meeting','communication','off_task','idle','untracked')),
  started_at       timestamptz not null,
  ended_at         timestamptz,
  duration_seconds int,
  session_id       uuid references focus_sessions(id)
);

-- ── daily_summaries ──────────────────────────────────────────────
create table daily_summaries (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references users(id) not null,
  team_org_id          uuid references teams(id) not null,
  date                 date not null,
  total_tracked_seconds int default 0,
  deep_work_seconds    int default 0,
  meeting_seconds      int default 0,
  comms_seconds        int default 0,
  off_task_seconds     int default 0,
  focus_score          int,
  context_switches     int default 0,
  commitments_set      int default 0,
  commitments_done     int default 0,
  unique(user_id, date)
);

-- ─────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────
create index commitments_user_date on commitments(user_id, date) where deleted_at is null;
create index commitments_team_date on commitments(team_org_id, date) where deleted_at is null;
create index focus_sessions_user_status on focus_sessions(user_id, status);
create index focus_sessions_team on focus_sessions(team_org_id);
create index focus_blocks_user_date on focus_blocks(user_id, date) where deleted_at is null;
create index raw_events_user_recorded on raw_events(user_id, recorded_at);
create index activity_events_user_time on activity_events(user_id, started_at);
create index activity_events_team on activity_events(team_org_id, started_at);
create index daily_summaries_user_date on daily_summaries(user_id, date);
create index daily_summaries_team on daily_summaries(team_org_id, date);
create index quick_captures_user on quick_captures(user_id, created_at);

-- ─────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────
alter table users enable row level security;
alter table teams enable row level security;
alter table commitments enable row level security;
alter table quick_captures enable row level security;
alter table focus_sessions enable row level security;
alter table focus_blocks enable row level security;
alter table raw_events enable row level security;
alter table activity_events enable row level security;
alter table daily_summaries enable row level security;

-- Helper: get current user's team_org_id
create or replace function get_my_team_org_id()
returns uuid
language sql security definer
as $$
  select team_org_id from users where id = auth.uid();
$$;

-- Helper: is current user an admin?
create or replace function is_team_admin()
returns boolean
language sql security definer
as $$
  select role = 'admin' from users where id = auth.uid();
$$;

-- ── users policies ───────────────────────────────────────────────
create policy "users: select own" on users
  for select using (id = auth.uid());

create policy "users: insert own on signup" on users
  for insert with check (id = auth.uid());

create policy "users: update own" on users
  for update using (id = auth.uid());

-- ── teams policies ───────────────────────────────────────────────
create policy "teams: select own team" on teams
  for select using (id = get_my_team_org_id());

create policy "teams: insert (during signup)" on teams
  for insert with check (created_by = auth.uid());

create policy "teams: update own (admin)" on teams
  for update using (id = get_my_team_org_id() and is_team_admin());

-- ── commitments policies ─────────────────────────────────────────
create policy "commitments: select own" on commitments
  for select using (
    user_id = auth.uid() or
    (team_org_id = get_my_team_org_id() and is_team_admin())
  );

create policy "commitments: insert own" on commitments
  for insert with check (user_id = auth.uid());

create policy "commitments: update own" on commitments
  for update using (user_id = auth.uid());

-- ── quick_captures policies ──────────────────────────────────────
create policy "qc: select own" on quick_captures
  for select using (user_id = auth.uid());

create policy "qc: insert own" on quick_captures
  for insert with check (user_id = auth.uid());

-- ── focus_sessions policies ──────────────────────────────────────
create policy "sessions: select own or admin" on focus_sessions
  for select using (
    user_id = auth.uid() or
    (team_org_id = get_my_team_org_id() and is_team_admin())
  );

create policy "sessions: insert own" on focus_sessions
  for insert with check (user_id = auth.uid());

create policy "sessions: update own" on focus_sessions
  for update using (user_id = auth.uid());

-- ── focus_blocks policies ────────────────────────────────────────
create policy "blocks: select own" on focus_blocks
  for select using (user_id = auth.uid());

create policy "blocks: insert own" on focus_blocks
  for insert with check (user_id = auth.uid());

create policy "blocks: update own" on focus_blocks
  for update using (user_id = auth.uid());

create policy "blocks: delete own" on focus_blocks
  for delete using (user_id = auth.uid());

-- ── raw_events policies ──────────────────────────────────────────
create policy "raw_events: insert (agent)" on raw_events
  for insert with check (user_id = auth.uid());

create policy "raw_events: select own" on raw_events
  for select using (user_id = auth.uid());

-- ── activity_events policies ─────────────────────────────────────
create policy "activity: select own or admin" on activity_events
  for select using (
    user_id = auth.uid() or
    (team_org_id = get_my_team_org_id() and is_team_admin())
  );

create policy "activity: insert (edge function)" on activity_events
  for insert with check (true); -- edge function uses service role

-- ── daily_summaries policies ─────────────────────────────────────
create policy "summaries: select own or admin" on daily_summaries
  for select using (
    user_id = auth.uid() or
    (team_org_id = get_my_team_org_id() and is_team_admin())
  );

-- ─────────────────────────────────────────────────────────────────
-- TRIGGERS
-- ─────────────────────────────────────────────────────────────────

-- Auto-update commitments.updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger commitments_updated_at
  before update on commitments
  for each row execute procedure update_updated_at();
