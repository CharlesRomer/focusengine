import { format, formatDistanceToNow, parseISO } from 'date-fns'

/** Format a UTC ISO string to local date string */
export function formatLocalDate(utcString: string, fmt = 'MMM d, yyyy') {
  return format(parseISO(utcString), fmt)
}

/** Format a UTC ISO string to local time string */
export function formatLocalTime(utcString: string, fmt = 'h:mm a') {
  return format(parseISO(utcString), fmt)
}

/** Get today's date as YYYY-MM-DD in local timezone */
export function todayLocal(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Get elapsed seconds between a start ISO timestamp and now */
export function elapsedSeconds(startedAt: string, totalPauseSeconds = 0): number {
  const start = parseISO(startedAt).getTime()
  const now = Date.now()
  return Math.floor((now - start) / 1000) - totalPauseSeconds
}

/** Format seconds to HH:MM:SS */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

/** Format seconds to human readable (e.g. "2h 15m") */
export function formatHuman(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${seconds}s`
}

/** Relative time like "2 minutes ago" */
export function timeAgo(utcString: string): string {
  return formatDistanceToNow(parseISO(utcString), { addSuffix: true })
}

/** Get greeting based on hour */
export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Convert a local date to start/end of day in UTC ISO strings */
export function dayBounds(localDate: string): { start: string; end: string } {
  const date = new Date(localDate + 'T00:00:00')
  const start = new Date(date)
  const end = new Date(date)
  end.setDate(end.getDate() + 1)
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}
