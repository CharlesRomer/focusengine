-- Drop the categorize trigger — tracker now writes sessions directly
drop trigger if exists on_raw_event_insert on raw_events;
drop function if exists categorize_raw_event();

-- Make raw_event_id nullable so tracker can write directly to activity_events
alter table activity_events alter column raw_event_id drop not null;

-- Make category optional with a safe default
alter table activity_events alter column category set default 'untracked';

-- Add tab_title and bundle_id columns for display
alter table activity_events add column if not exists tab_title text;
alter table activity_events add column if not exists bundle_id text;

-- Allow direct inserts from agent (no auth.uid() — agent uses service role via anon+token)
drop policy if exists "activity: insert own" on activity_events;
create policy "activity: insert own" on activity_events
  for insert with check (
    user_id = auth.uid()
    or user_id = get_user_id_by_agent_token(
      coalesce(current_setting('request.headers', true)::json->>'x-agent-token', '')
    )
  );
