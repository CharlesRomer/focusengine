-- Best-effort backfill: match activity events to sessions by timestamp overlap.
-- Run once manually in the Supabase SQL editor.
UPDATE activity_events ae
SET    session_id = fs.id
FROM   focus_sessions fs
WHERE  ae.user_id          = fs.user_id
  AND  ae.session_id       IS NULL
  AND  ae.started_at       >= fs.started_at
  AND  ae.started_at       <= COALESCE(fs.ended_at, NOW())
  AND  fs.status           = 'ended';
