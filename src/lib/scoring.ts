import type { DBActivityEvent, DBFocusSession } from './supabase'

export interface ScoringInput {
  session: DBFocusSession
  activityEvents: DBActivityEvent[]
}

/**
 * Compute a focus score 0–100.
 * Returns null when no activity data exists — null is honest, 0 is misleading.
 * Will be fully wired to real macOS-agent data in Phase 5.
 */
export function computeFocusScore({ session, activityEvents }: ScoringInput): number | null {
  if (activityEvents.length === 0) return null

  const sessionStart = new Date(session.started_at).getTime()
  const sessionEnd   = session.ended_at
    ? new Date(session.ended_at).getTime()
    : Date.now()

  // Only events that started within this session window
  const sessionEvents = activityEvents.filter(ev => {
    const evMs = new Date(ev.started_at).getTime()
    return evMs >= sessionStart && evMs <= sessionEnd
  })

  if (sessionEvents.length === 0) return null

  const durationMs   = (sessionEnd - sessionStart) - (session.total_pause_seconds * 1_000)
  const durationMins = Math.max(0, durationMs / 60_000)

  let score = 100

  const distractingEvents = sessionEvents.filter(
    ev => ev.category === 'communication' || ev.category === 'off_task'
  )

  const twentyMinMark = sessionStart + 20 * 60 * 1_000

  for (const ev of distractingEvents) {
    const evMs = new Date(ev.started_at).getTime()
    // Early distractions hurt more (within first 20 min)
    score -= evMs < twentyMinMark ? 6 : 4
    // Sustained distractions (≥ 10 continuous minutes) incur extra penalty
    if ((ev.duration_seconds ?? 0) >= 600) score -= 8
  }

  // Short session cap
  if (durationMins < 15) score = Math.min(score, 60)

  // Long focused session bonuses — not additive, higher replaces lower
  if (durationMins >= 90 && distractingEvents.length <= 2) {
    score += 10
  } else if (durationMins >= 60 && distractingEvents.length <= 3) {
    score += 5
  }

  return Math.max(0, Math.min(100, Math.round(score)))
}
