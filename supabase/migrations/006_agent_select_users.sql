-- Allow agent to read its own user row (needed to fetch team_org_id)
drop policy if exists "users: select own (agent)" on users;
create policy "users: select own (agent)" on users
  for select using (
    id = auth.uid()
    or id = get_user_id_by_agent_token(
      coalesce(current_setting('request.headers', true)::json->>'x-agent-token', '')
    )
  );
