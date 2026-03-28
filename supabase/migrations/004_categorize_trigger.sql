-- Categorize raw_events into activity_events via a DB trigger
-- This replaces the webhook + Edge Function approach for categorization

create or replace function categorize_raw_event()
returns trigger language plpgsql security definer as $$
declare
  v_team_org_id uuid;
  v_category    text;
  v_bundle      text := new.bundle_id;
  v_url         text := new.tab_url;
begin
  -- Get team_org_id
  select team_org_id into v_team_org_id from users where id = new.user_id;
  if v_team_org_id is null then return new; end if;

  -- Categorize
  if new.is_idle then
    v_category := 'idle';
  elsif v_bundle in ('us.zoom.xos','com.microsoft.teams','com.google.Meet','com.apple.FaceTime') then
    v_category := 'meeting';
  elsif v_bundle in ('com.tinyspeck.slackmacgap','com.apple.mail','com.microsoft.Outlook','com.apple.MobileSMS') then
    v_category := 'communication';
  elsif v_bundle like 'com.microsoft.VSCode%' or v_bundle like 'com.apple.Xcode%'
     or v_bundle like 'com.figma.Desktop%' or v_bundle like 'org.vim.MacVim%'
     or v_bundle like 'com.notion.id%'     or v_bundle like 'com.linear.app%' then
    v_category := 'deep_work';
  elsif v_url is not null and (
    v_url like '%twitter.com%' or v_url like '%x.com%' or v_url like '%instagram.com%'
    or v_url like '%facebook.com%' or v_url like '%reddit.com%'
    or v_url like '%youtube.com%' or v_url like '%netflix.com%' or v_url like '%tiktok.com%'
  ) then
    v_category := 'off_task';
  elsif v_url is not null and (
    v_url like '%meet.google.com%' or v_url like '%zoom.us%' or v_url like '%teams.microsoft.com%'
  ) then
    v_category := 'meeting';
  elsif v_url is not null and (
    v_url like '%mail.google.com%' or v_url like '%slack.com%'
  ) then
    v_category := 'communication';
  elsif v_url is not null and (
    v_url like '%github.com%' or v_url like '%gitlab.com%' or v_url like '%figma.com%'
    or v_url like '%notion.so%' or v_url like '%linear.app%' or v_url like '%vercel.com%'
    or v_url like '%docs.google.com%'
  ) then
    v_category := 'deep_work';
  else
    v_category := 'untracked';
  end if;

  insert into activity_events (user_id, team_org_id, raw_event_id, app_name, category, started_at, session_id)
  values (new.user_id, v_team_org_id, new.id, new.app_name, v_category, new.recorded_at, new.session_id);

  return new;
end;
$$;

drop trigger if exists on_raw_event_insert on raw_events;
create trigger on_raw_event_insert
  after insert on raw_events
  for each row execute function categorize_raw_event();
