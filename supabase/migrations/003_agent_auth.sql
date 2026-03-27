-- Helper: look up user_id from agent_token (SECURITY DEFINER so it can read users table)
create or replace function get_user_id_by_agent_token(p_token text)
returns uuid language sql security definer as $$
  select id from users where agent_token = p_token limit 1;
$$;

-- Replace raw_events insert policy to allow agent inserts via x-agent-token header
drop policy if exists "raw_events: insert (agent)" on raw_events;

create policy "raw_events: insert (agent)" on raw_events
  for insert with check (
    -- Web app writing its own events (authenticated user)
    user_id = auth.uid()
    or
    -- macOS agent writing via agent_token header
    user_id = get_user_id_by_agent_token(
      coalesce(
        current_setting('request.headers', true)::json->>'x-agent-token',
        ''
      )
    )
  );
