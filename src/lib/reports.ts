import { startOfDay, endOfDay, startOfWeek, endOfWeek, subDays, format, parseISO } from 'date-fns'
import type { ActivityCategory } from './supabase'

// ── Timezone ─────────────────────────────────────────────────────
export const USER_TIMEZONE = 'America/Los_Angeles'

// ── Time windows ─────────────────────────────────────────────────
export type TimeWindow = 'today' | 'week' | '30days'

export interface WindowBounds {
  start: Date
  end: Date
  label: string
}

export function getWindowBounds(window: TimeWindow): WindowBounds {
  const now = new Date()
  switch (window) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now), label: 'Today' }
    case 'week':
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
        label: 'This week',
      }
    case '30days':
      return { start: startOfDay(subDays(now, 29)), end: endOfDay(now), label: 'Last 30 days' }
  }
}

// ── Category colors ───────────────────────────────────────────────
export const CATEGORY_COLORS: Record<ActivityCategory, string> = {
  deep_work:     '#7C6FE0',
  meeting:       '#5A9FE0',
  communication: '#E0A052',
  off_task:      '#D95C5C',
  idle:          '#2A2A35',
  untracked:     '#3A3A3A',
}

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  deep_work:     'Deep work',
  meeting:       'Meetings',
  communication: 'Communication',
  off_task:      'Off task',
  idle:          'Idle',
  untracked:     'Untracked',
}

// ── Duration formatting ───────────────────────────────────────────
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatDurationLong(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${m} min`
}

// ── Focus score ───────────────────────────────────────────────────
export function formatScore(score: number | null): string {
  if (score === null) return '—'
  return Math.round(score).toString()
}

export function scoreColor(score: number | null): string {
  if (score === null) return 'var(--text-tertiary)'
  if (score >= 75) return 'var(--success)'
  if (score >= 50) return 'var(--warning)'
  return 'var(--danger)'
}

// ── Commitment execution rate ─────────────────────────────────────
export function executionRate(done: number, total: number): number {
  if (total === 0) return 0
  return Math.round((done / total) * 100)
}

// ── Domain extraction ─────────────────────────────────────────────
export function extractDomain(url: string | null): string {
  if (!url) return 'Unknown'
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url.slice(0, 30)
  }
}

// ── Timezone-aware date conversion ────────────────────────────────
// Converts a UTC ISO string to the equivalent local date object in USER_TIMEZONE
// by formatting in that timezone and reparsing. Used for heatmap DOW/hour extraction.
export function toTZDate(isoStr: string): Date {
  const d = parseISO(isoStr)
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: USER_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d)
  // formatted: "YYYY-MM-DD, HH:mm:ss"
  const clean = formatted.replace(', ', 'T')
  return new Date(clean)
}

export function tzHour(isoStr: string): number {
  return toTZDate(isoStr).getHours()
}

// 0=Sun … 6=Sat → re-map to 0=Mon … 6=Sun
export function tzDow(isoStr: string): number {
  const d = toTZDate(isoStr).getDay() // 0=Sun
  return d === 0 ? 6 : d - 1
}

// ── Chart shared style constants ──────────────────────────────────
export const CHART_TOOLTIP_STYLE = {
  background: '#1C1C21',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 8,
  fontSize: 12,
  color: '#F0EFE8',
}

export const CHART_TICK_STYLE = { fill: '#5C5B57', fontSize: 11 }

export const CHART_GRID_PROPS = {
  strokeDasharray: '3 3' as const,
  stroke: 'rgba(255,255,255,0.05)',
}

export const CHART_AXIS_PROPS = {
  axisLine: false,
  tickLine: false,
}

// ── Date label for chart axes ─────────────────────────────────────
export function shortDate(iso: string): string {
  return format(parseISO(iso), 'M/d')
}
