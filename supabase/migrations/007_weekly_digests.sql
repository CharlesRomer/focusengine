-- Weekly digest storage
create table if not exists weekly_digests (
  id            uuid primary key default gen_random_uuid(),
  team_org_id   uuid not null references teams(id) on delete cascade,
  week_start    date not null,
  content       text not null,
  created_at    timestamptz not null default now()
);

-- One digest per team per week
create unique index if not exists weekly_digests_team_week
  on weekly_digests (team_org_id, week_start);

-- RLS
alter table weekly_digests enable row level security;

-- Members can read their team's digests
create policy "team members can read digests"
  on weekly_digests for select
  using (
    team_org_id = (
      select team_org_id from users where id = auth.uid()
    )
  );

-- Only service role / edge functions can insert (anon cannot write directly)
create policy "service role can manage digests"
  on weekly_digests for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
