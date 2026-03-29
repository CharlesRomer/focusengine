import type { DBActivityEvent, DBFocusSession } from './supabase'

export interface ScoringInput {
  session: DBFocusSession
  activityEvents: DBActivityEvent[]
}

export interface AppClassificationInput {
  classification: 'focused' | 'distraction'
  duration_seconds: number
}

/**
 * Category-based live score — used during an active session before user classifies apps.
 * Returns null when no activity data exists.
 */
export function computeLiveScore({ session, activityEvents }: ScoringInput): number | null {
  if (activityEvents.length === 0) return null

  const sessionStart = new Date(session.started_at).getTime()
  const sessionEnd   = session.ended_at
    ? new Date(session.ended_at).getTime()
    : Date.now()

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
    score -= evMs < twentyMinMark ? 6 : 4
    if ((ev.duration_seconds ?? 0) >= 600) score -= 8
  }

  if (durationMins < 15) score = Math.min(score, 60)

  if (durationMins >= 90 && distractingEvents.length <= 2) {
    score += 10
  } else if (durationMins >= 60 && distractingEvents.length <= 3) {
    score += 5
  }

  return Math.max(0, Math.min(100, Math.round(score)))
}

/**
 * Classification-based final score — computed after user classifies apps at session end.
 * Returns null when no classifications exist.
 */
export function computeFocusScore(
  classifications: AppClassificationInput[],
  sessionDurationSeconds: number
): number | null {
  if (classifications.length === 0) return null

  const totalClassified = classifications.reduce((sum, c) => sum + c.duration_seconds, 0)
  const focusedSeconds  = classifications
    .filter(c => c.classification === 'focused')
    .reduce((sum, c) => sum + c.duration_seconds, 0)

  const focusRatio = totalClassified > 0 ? focusedSeconds / totalClassified : 1

  let score = Math.round(focusRatio * 100)

  // Bonus: long session with high focus
  if (sessionDurationSeconds >= 5400 && focusRatio >= 0.8) {
    score = Math.min(100, score + 5)
  }
  // Penalty: very short session
  if (sessionDurationSeconds < 900) {
    score = Math.min(score, 60)
  }
  // Penalty: majority of time was distraction
  if (focusRatio < 0.3) {
    score = Math.min(score, 30)
  }

  return Math.max(0, Math.min(100, score))
}

export function scoreFocusRatio(classifications: AppClassificationInput[]): number {
  const total   = classifications.reduce((s, c) => s + c.duration_seconds, 0)
  const focused = classifications.filter(c => c.classification === 'focused')
    .reduce((s, c) => s + c.duration_seconds, 0)
  return total > 0 ? focused / total : 0
}

export function scoreLabel(score: number): string {
  if (score >= 90) return 'Outstanding focus'
  if (score >= 70) return 'Strong session'
  if (score >= 50) return 'Decent session'
  if (score >= 30) return 'Significant drift'
  return 'Rough one — happens'
}
