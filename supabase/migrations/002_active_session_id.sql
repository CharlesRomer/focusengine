-- Add active_session_id to users so the macOS agent can poll current session
alter table users
  add column if not exists active_session_id uuid references focus_sessions(id) on delete set null;
