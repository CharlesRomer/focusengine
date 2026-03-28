// Team Calendar — multi-column day view
// "You" column uses FullCalendar (full interactivity).
// Other member columns use a custom fixed-height timeline.
// All columns live inside a single overflow-y:auto container → one scrollbar.

import { useState, useRef, useEffect } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type {
  DateSelectArg,
  EventClickArg,
  EventChangeArg,
} from '@fullcalendar/core'
import type { DropArg } from '@fullcalendar/interaction'
import { format } from 'date-fns'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DBUser, DBFocusSession, DBFocusBlock } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useSessionStore } from '@/store/session'
import { Avatar } from '@/components/shared/Avatar'
import { toast } from '@/store/ui'

// ── Timeline constants ────────────────────────────────────────────
const SLOT_HOURS_START = 6   // 6am
const SLOT_HOURS_END   = 22  // 10pm
const TOTAL_HOURS      = SLOT_HOURS_END - SLOT_HOURS_START  // 16
const PX_PER_HOUR      = 96  // 4 slots × 24px (matches global FC slot height)
const TIMELINE_HEIGHT  = TOTAL_HOURS * PX_PER_HOUR  // 1536px

// ── Helpers ───────────────────────────────────────────────────────
function extractDate(isoStr: string) { return isoStr.split('T')[0] }
function extractTime(isoStr: string) { return isoStr.split('T')[1]?.slice(0, 5) ?? '00:00' }
function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const dh = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${dh}:${String(m).padStart(2, '0')}${suffix}`
}
function timeRangeLabel(start: string, end: string) {
  return `${fmt12(start)} – ${fmt12(end)}`
}
function addMinutesToTime(t: string, mins: number): string {
  const [h, m] = t.split(':').map(Number)
  const total  = h * 60 + m + mins
  return `${String(Math.min(Math.floor(total / 60), 23)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// Convert HH:MM to pixel offset from SLOT_HOURS_START
function timeToPx(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return (h - SLOT_HOURS_START) * PX_PER_HOUR + (m / 60) * PX_PER_HOUR
}
function durationToPx(startStr: string, endStr: string): number {
  const [sh, sm] = startStr.split(':').map(Number)
  const [eh, em] = endStr.split(':').map(Number)
  const diffMin  = (eh * 60 + em) - (sh * 60 + sm)
  return Math.max((diffMin / 60) * PX_PER_HOUR, 16)
}

// ── Block edit popover (reused from FocusCalendar) ────────────────
interface PopoverState { blockId: string; timeLabel: string; x: number; y: number }

interface BlockEditPopoverProps {
  state: PopoverState
  name: string
  onChange: (v: string) => void
  onClose: (save: boolean) => void
  onDelete: () => void
  onStartSession: () => void
  hasActiveSession: boolean
  popoverRef: React.RefObject<HTMLDivElement>
}

function BlockEditPopover({
  state, name, onChange, onClose, onDelete,
  onStartSession, hasActiveSession, popoverRef,
}: BlockEditPopoverProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const W = 220, H = 155
  useEffect(() => { setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 30) }, [])
  const vw   = window.innerWidth, vh   = window.innerHeight
  const left = state.x + W > vw - 8 ? state.x - W - 8 : state.x + 8
  const top  = state.y + H > vh - 8 ? state.y - H     : state.y

  return (
    <div
      ref={popoverRef}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', left: Math.max(8, left), top: Math.max(8, top),
        width: W, zIndex: 1000,
        background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)', padding: '12px', boxShadow: 'var(--shadow-lg)',
      }}
    >
      <input
        ref={inputRef} value={name} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onClose(true); if (e.key === 'Escape') onClose(false) }}
        placeholder="Block name"
        style={{
          width: '100%', display: 'block',
          background: 'transparent', border: 'none', outline: 'none',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: 6, marginBottom: 6,
          color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontWeight: 500,
          fontFamily: 'var(--font-sans)',
        }}
      />
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 10 }}>
        {state.timeLabel}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={hasActiveSession ? undefined : onStartSession}
          disabled={hasActiveSession}
          style={{
            flex: 1, padding: '5px 0',
            background: hasActiveSession ? 'transparent' : 'var(--accent-subtle)',
            border: `1px solid ${hasActiveSession ? 'var(--border-default)' : 'var(--accent)'}`,
            borderRadius: 'var(--radius-md)',
            color: hasActiveSession ? 'var(--text-disabled)' : 'var(--accent)',
            fontSize: 'var(--text-xs)', fontWeight: 500,
            cursor: hasActiveSession ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)',
          }}
        >
          {hasActiveSession ? 'Session active' : 'Start session'}
        </button>
        <button
          onClick={onDelete}
          style={{
            flex: 1, padding: '5px 0',
            background: 'none', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--danger)', fontSize: 'var(--text-xs)', fontWeight: 500,
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

// ── Busy/focus event block for other members ──────────────────────
interface MemberEventBlockProps {
  top: number
  height: number
  title?: string
  variant?: 'busy' | 'focus' | 'session'
  tooltip?: string
}

function MemberEventBlock({ top, height, title, variant = 'busy', tooltip }: MemberEventBlockProps) {
  const blockStyle = variant
  const [showTip, setShowTip] = useState(false)

  const bg: Record<string, string> = {
    busy:    'rgba(255,255,255,0.06)',
    focus:   'rgba(124,111,224,0.30)',
    session: 'rgba(124,111,224,0.20)',
  }
  const border: Record<string, string> = {
    busy:    '1px solid rgba(255,255,255,0.08)',
    focus:   '1px solid rgba(124,111,224,0.5)',
    session: '3px solid var(--accent)',
  }

  return (
    <div
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      style={{
        position: 'absolute',
        top,
        left: 4,
        right: 4,
        height: Math.max(height, 16),
        background: bg[blockStyle],
        border: border[blockStyle],
        borderRadius: 4,
        padding: '2px 5px',
        overflow: 'hidden',
        cursor: 'default',
        animation: blockStyle === 'session' ? 'session-pulse 2s ease-in-out infinite' : undefined,
      }}
    >
      {title && blockStyle !== 'busy' && (
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
          {title}
        </span>
      )}
      {showTip && tooltip && (
        <div style={{
          position: 'fixed',
          transform: 'translate(8px, -50%)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 6,
          padding: '5px 10px',
          fontSize: 12,
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap',
          zIndex: 999,
          pointerEvents: 'none',
          boxShadow: 'var(--shadow-md)',
        }}>
          {tooltip}
        </div>
      )}
    </div>
  )
}

// ── Custom timeline for a single team member ──────────────────────
interface MemberTimelineProps {
  focusBlocks: DBFocusBlock[]
  busyTimes:   Array<{ start: string; end: string }>
  activeSession: DBFocusSession | null
  memberName: string
}

function MemberTimeline({ focusBlocks, busyTimes, activeSession, memberName }: MemberTimelineProps) {
  const now = new Date()

  return (
    <div style={{ position: 'relative', height: TIMELINE_HEIGHT, background: 'var(--bg-base)' }}>
      {/* Hour lines */}
      {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: i * PX_PER_HOUR,
          left: 0, right: 0,
          borderTop: `1px solid var(--border-subtle)`,
          pointerEvents: 'none',
        }} />
      ))}

      {/* Busy blocks from GCal freebusy — timestamps are UTC, convert to local */}
      {busyTimes.map((b, i) => {
        const startTime = b.start ? format(new Date(b.start), 'HH:mm') : '00:00'
        const endTime   = b.end   ? format(new Date(b.end),   'HH:mm') : '00:00'
        const top    = timeToPx(startTime)
        const height = durationToPx(startTime, endTime)
        if (top < 0 || top > TIMELINE_HEIGHT) return null
        return (
          <MemberEventBlock key={`busy-${i}`} top={top} height={height} variant="busy" tooltip="Busy" />
        )
      })}

      {/* Focus blocks */}
      {focusBlocks.map(b => {
        const top    = timeToPx(b.start_time)
        const height = durationToPx(b.start_time, b.end_time)
        if (top < 0 || top > TIMELINE_HEIGHT) return null
        return (
          <MemberEventBlock
            key={b.id}
            top={top} height={height}
            variant="focus"
            title={b.name}
            tooltip={`${b.name} · ${timeRangeLabel(b.start_time, b.end_time)}`}
          />
        )
      })}

      {/* Active session — started_at is UTC, convert to local */}
      {activeSession && (() => {
        const startTime = format(new Date(activeSession.started_at), 'HH:mm')
        const nowTime   = format(now, 'HH:mm')
        const top    = timeToPx(startTime)
        const height = durationToPx(startTime, nowTime)
        if (top < 0 || top > TIMELINE_HEIGHT) return null
        const elapsedMins = Math.floor((now.getTime() - new Date(activeSession.started_at).getTime()) / 60_000)
        const tooltip = `${memberName} is in a session · ${elapsedMins}m`
        return (
          <MemberEventBlock
            key={activeSession.id}
            top={top} height={height}
            variant="session"
            title={activeSession.name}
            tooltip={tooltip}
          />
        )
      })()}
    </div>
  )
}

// ── Team member column header ─────────────────────────────────────
function ColHeader({ member, isYou }: { member: DBUser; isYou: boolean }) {
  return (
    <div style={{
      height: 48,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      background: isYou ? 'rgba(124,111,224,0.04)' : 'var(--bg-surface)',
      borderBottom: isYou
        ? '2px solid rgba(124,111,224,0.4)'
        : '1px solid var(--border-subtle)',
      flexShrink: 0,
    }}>
      <Avatar userId={member.id} name={member.display_name} size={24} />
      <span style={{
        fontSize: 13,
        fontWeight: 500,
        color: isYou ? 'var(--accent)' : 'var(--text-primary)',
      }}>
        {isYou ? 'You' : member.display_name}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────
interface TeamCalendarDayProps {
  date: Date
}

export function TeamCalendarDay({ date }: TeamCalendarDayProps) {
  const user          = useAuthStore(s => s.user)
  const qc            = useQueryClient()
  const activeSession = useSessionStore(s => s.activeSession)
  const setActive     = useSessionStore(s => s.setActiveSession)
  const dateStr       = format(date, 'yyyy-MM-dd')

  // ── Popover state (for "You" column) ─────────────────────────
  const [popover,      setPopover]     = useState<PopoverState | null>(null)
  const [popoverName,  setPopoverName] = useState('')
  const popoverRef     = useRef<HTMLDivElement>(null)
  const popoverNameRef = useRef('')
  const calendarRef    = useRef<FullCalendar>(null)

  // Navigate calendar when date prop changes
  useEffect(() => {
    calendarRef.current?.getApi().gotoDate(date)
  }, [date])

  // ── Fetch team members ────────────────────────────────────────
  const { data: teamMembers = [] } = useQuery<DBUser[]>({
    queryKey: ['team-members', user?.team_org_id],
    enabled: !!user?.team_org_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('team_org_id', user!.team_org_id)
        .order('display_name')
      if (error) throw error
      return data as DBUser[]
    },
  })

  // Sort: "You" first, then alphabetical
  const orderedMembers = [
    ...(teamMembers.filter(m => m.id === user?.id)),
    ...(teamMembers.filter(m => m.id !== user?.id)),
  ]

  // ── Fetch today's focus blocks for all team members ───────────
  const { data: allFocusBlocks = [] } = useQuery<DBFocusBlock[]>({
    queryKey: ['team-focus-blocks', user?.team_org_id, dateStr],
    enabled: !!user?.team_org_id,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('focus_blocks')
        .select('*')
        .eq('date', dateStr)
        .is('deleted_at', null)
        .in('user_id', teamMembers.map(m => m.id))
      if (error) throw error
      return data as DBFocusBlock[]
    },
  })

  // ── Fetch active sessions for team members ────────────────────
  const { data: activeSessions = [] } = useQuery<(DBFocusSession & { member_id: string })[]>({
    queryKey: ['team-active-sessions', user?.team_org_id],
    enabled: !!user?.team_org_id,
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const memberIds = teamMembers.filter(m => m.id !== user?.id).map(m => m.id)
      if (!memberIds.length) return []
      // Get active_session_id for each member, then fetch sessions
      const { data: usersData } = await supabase
        .from('users')
        .select('id, active_session_id')
        .in('id', memberIds)
        .not('active_session_id', 'is', null)

      if (!usersData?.length) return []

      const sessionIds = usersData.map(u => u.active_session_id).filter(Boolean)
      const { data: sessions } = await supabase
        .from('focus_sessions')
        .select('*')
        .in('id', sessionIds)
        .eq('status', 'active')

      if (!sessions?.length) return []

      return sessions.map(s => {
        const matchUser = usersData.find(u => u.active_session_id === s.id)
        return { ...s, member_id: matchUser?.id ?? '' }
      }) as (DBFocusSession & { member_id: string })[]
    },
  })

  // ── Fetch busy times from edge function ───────────────────────
  const { data: busyMap = {} } = useQuery<Record<string, Array<{ start: string; end: string }>>>({
    queryKey: ['team-busy-times', user?.team_org_id, dateStr],
    enabled: !!user?.team_org_id,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const off  = new Date().getTimezoneOffset()
      const sign = off <= 0 ? '+' : '-'
      const abs  = Math.abs(off)
      const tz   = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
      const { data, error } = await supabase.functions.invoke('get-team-busy-times', {
        body: { date_min: `${dateStr}T00:00:00${tz}`, date_max: `${dateStr}T23:59:59${tz}` },
      })
      if (error) {
        console.error('[TeamCalendarDay] busy times', error)
        toast('Could not load team calendar', 'error')
        return {}
      }
      return data ?? {}
    },
  })

  // ── "You" column — FullCalendar interactions ──────────────────
  const { data: myFocusBlocks = [] } = useQuery<DBFocusBlock[]>({
    queryKey: ['focus_blocks', user?.id, dateStr, dateStr],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('focus_blocks')
        .select('*')
        .eq('user_id', user!.id)
        .eq('date', dateStr)
        .is('deleted_at', null)
        .order('start_time')
      if (error) throw error
      return data as DBFocusBlock[]
    },
  })

  // GCal events for "You" column
  const gcalEnabled = !!user?.google_calendar_connected
  const { data: gcalEvents = [] } = useQuery<Array<{ id: string; summary: string; start: string; end: string; isAllDay: boolean }>>({
    queryKey: ['gcal-events', user?.id, dateStr, dateStr],
    enabled: gcalEnabled,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      // Use local timezone offset so we query the full local day, not the UTC day
      const off  = new Date().getTimezoneOffset()
      const sign = off <= 0 ? '+' : '-'
      const abs  = Math.abs(off)
      const tz   = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
      const { data, error } = await supabase.functions.invoke('get-calendar-events', {
        body: { date_min: `${dateStr}T00:00:00${tz}`, date_max: `${dateStr}T23:59:59${tz}` },
      })
      if (error) {
        console.error('[TeamCalendarDay] gcal fetch error', error)
        toast('Could not load Google Calendar events', 'error')
        return []
      }
      return data ?? []
    },
  })

  const yourCalendarEvents = [
    ...myFocusBlocks.map(b => ({
      id:              b.id,
      title:           b.name,
      start:           `${b.date}T${b.start_time}`,
      end:             `${b.date}T${b.end_time}`,
      backgroundColor: 'var(--accent)',
      borderColor:     'transparent',
      editable:        true,
      extendedProps:   { sessionId: b.session_id },
    })),
    ...gcalEvents.map(e => ({
      id:              `gcal-${e.id}`,
      title:           e.summary,
      start:           e.start,
      end:             e.end,
      allDay:          e.isAllDay,
      editable:        false,
      backgroundColor: 'rgba(90,159,224,0.15)',
      borderColor:     '#5A9FE0',
      textColor:       '#6FB0E8',
      classNames:      ['gcal-event'],
      extendedProps:   { type: 'gcal' },
    })),
  ]

  // Popover helpers
  function handleNameChange(val: string) {
    setPopoverName(val)
    popoverNameRef.current = val
  }

  useEffect(() => {
    if (!popover) return
    const id = setTimeout(() => {
      const val = popoverNameRef.current.trim()
      if (val) saveBlockName(popover.blockId, val)
    }, 500)
    return () => clearTimeout(id)
  }, [popoverName]) // eslint-disable-line

  useEffect(() => {
    if (!popover) return
    function onMouseDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        const val = popoverNameRef.current.trim()
        if (val) saveBlockName(popover!.blockId, val)
        setPopover(null)
      }
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', onMouseDown), 0)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', onMouseDown) }
  }, [popover]) // eslint-disable-line

  async function saveBlockName(blockId: string, name: string) {
    const { error } = await supabase.from('focus_blocks').update({ name }).eq('id', blockId)
    if (error) toast('Could not save block name', 'error')
    else qc.invalidateQueries({ queryKey: ['focus_blocks'] })
  }

  async function deleteBlock(blockId: string) {
    setPopover(null)
    const { error } = await supabase.from('focus_blocks').update({ deleted_at: new Date().toISOString() }).eq('id', blockId)
    if (error) toast('Could not delete block', 'error')
    else qc.invalidateQueries({ queryKey: ['focus_blocks'] })
  }

  async function handleStartSession() {
    if (!user || !popover) return
    const { data: existing } = await supabase
      .from('focus_sessions').select('id').eq('user_id', user.id).in('status', ['active', 'paused']).limit(1).maybeSingle()
    if (existing) { toast('You already have an active session.', 'error'); setPopover(null); return }

    const name = popoverNameRef.current.trim() || 'Focus block'
    const { data, error } = await supabase
      .from('focus_sessions')
      .insert({ user_id: user.id, team_org_id: user.team_org_id ?? '', name, status: 'active', total_pause_seconds: 0, share_to_feed: false })
      .select().single()
    if (error) { toast('Could not start session', 'error'); return }
    await supabase.from('focus_blocks').update({ session_id: data.id }).eq('id', popover.blockId)
    void supabase.from('users').update({ active_session_id: data.id }).eq('id', user.id)
    setActive(data as DBFocusSession)
    qc.invalidateQueries({ queryKey: ['focus_blocks'] })
    toast('Session started — stay focused', 'success')
    setPopover(null)
  }

  function openPopover(blockId: string, name: string, timeLabel: string, x: number, y: number) {
    setPopoverName(name)
    popoverNameRef.current = name
    setPopover({ blockId, timeLabel, x, y })
  }

  function closePopover(save: boolean) {
    if (save && popover) {
      const val = popoverNameRef.current.trim()
      if (val) saveBlockName(popover.blockId, val)
    }
    setPopover(null)
  }

  async function handleSelect(info: DateSelectArg) {
    info.view.calendar.unselect()
    const date      = extractDate(info.startStr)
    const startTime = extractTime(info.startStr)
    const endTime   = extractTime(info.endStr)
    const { data, error } = await supabase
      .from('focus_blocks')
      .insert({ user_id: user!.id, name: 'Focus block', date, start_time: startTime, end_time: endTime })
      .select().single()
    if (error) { toast('Could not create block', 'error'); return }
    qc.invalidateQueries({ queryKey: ['focus_blocks'] })
    const jsEvent = info.jsEvent
    openPopover(data.id, 'Focus block', timeRangeLabel(startTime, endTime),
      jsEvent ? jsEvent.clientX : 400, jsEvent ? jsEvent.clientY : 200)
  }

  function handleEventClick(info: EventClickArg) {
    if (info.event.id.startsWith('gcal-')) return  // GCal events are non-interactive here
    const { start, end } = info.event
    const startStr = start ? format(start, 'HH:mm') : '00:00'
    const endStr   = end   ? format(end,   'HH:mm') : '00:00'
    const rect = info.el.getBoundingClientRect()
    openPopover(info.event.id, info.event.title, timeRangeLabel(startStr, endStr), rect.right + 8, rect.top)
  }

  async function handleEventChange(info: EventChangeArg) {
    const { error } = await supabase.from('focus_blocks').update({
      date:       extractDate(info.event.startStr),
      start_time: extractTime(info.event.startStr),
      end_time:   extractTime(info.event.endStr ?? info.event.startStr),
    }).eq('id', info.event.id)
    if (error) { toast('Could not save changes', 'error'); info.revert(); return }
    qc.invalidateQueries({ queryKey: ['focus_blocks'] })
  }

  async function handleExternalDrop(info: DropArg) {
    const commitmentId   = info.draggedEl.dataset.commitmentId
    const commitmentText = info.draggedEl.dataset.commitmentText
    if (!commitmentId || !commitmentText) return
    const date      = extractDate(info.dateStr)
    const startTime = extractTime(info.dateStr) || '09:00'
    const endTime   = addMinutesToTime(startTime, 60)
    const { error } = await supabase.from('focus_blocks')
      .insert({ user_id: user!.id, name: commitmentText, date, start_time: startTime, end_time: endTime, commitment_id: commitmentId })
    if (error) toast('Could not create block', 'error')
    else qc.invalidateQueries({ queryKey: ['focus_blocks'] })
  }

  // ── Realtime: team sessions ───────────────────────────────────
  useEffect(() => {
    if (!user?.team_org_id) return
    const channel = supabase
      .channel('team-sessions-day')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table:  'focus_sessions',
        filter: `team_org_id=eq.${user.team_org_id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['team-active-sessions'] })
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [user?.team_org_id]) // eslint-disable-line

  if (!user) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Sticky column headers */}
      <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid var(--border-subtle)' }}>
        {/* Time gutter spacer (matches FC time label width) */}
        <div style={{ width: 52, flexShrink: 0, background: 'var(--bg-surface)', borderRight: '1px solid var(--border-subtle)' }} />
        {orderedMembers.map(m => (
          <div
            key={m.id}
            style={{
              flex: 1, minWidth: 180,
              borderRight: '1px solid var(--border-subtle)',
            }}
          >
            <ColHeader member={m} isYou={m.id === user.id} />
          </div>
        ))}
      </div>

      {/* Single scroll container */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex' }}>
        {orderedMembers.map((m, idx) => {
          const isYou   = m.id === user.id
          const blocks  = allFocusBlocks.filter(b => b.user_id === m.id)
          const busy    = busyMap[m.id] ?? []
          const session = activeSessions.find(s => s.member_id === m.id) ?? null

          return (
            <div
              key={m.id}
              className={isYou ? 'tc-calendar' : undefined}
              style={{
                flex: 1,
                minWidth: 180,
                borderRight: idx < orderedMembers.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                flexShrink: 0,
              }}
            >
              {isYou ? (
                // "You" column — FullCalendar
                <FullCalendar
                  ref={calendarRef}
                  plugins={[timeGridPlugin, interactionPlugin]}
                  initialView="timeGridDay"
                  initialDate={format(date, 'yyyy-MM-dd')}
                  headerToolbar={false}
                  allDaySlot={false}
                  dayHeaders={false}
                  slotMinTime="06:00:00"
                  slotMaxTime="22:00:00"
                  slotDuration="00:15:00"
                  slotLabelInterval="01:00:00"
                  contentHeight="auto"
                  expandRows={false}
                  nowIndicator={true}
                  selectable={true}
                  selectMirror={true}
                  editable={true}
                  eventResizableFromStart={true}
                  snapDuration="00:15:00"
                  droppable={true}
                  events={yourCalendarEvents}
                  select={handleSelect}
                  eventClick={handleEventClick}
                  eventChange={handleEventChange}
                  drop={handleExternalDrop}
                />
              ) : (
                // Other members — custom timeline
                <MemberTimeline
                  focusBlocks={blocks}
                  busyTimes={busy}
                  activeSession={session}
                  memberName={m.display_name}
                />
              )}
            </div>
          )
        })}
      </div>

      {popover && (
        <BlockEditPopover
          state={popover}
          name={popoverName}
          onChange={handleNameChange}
          onClose={closePopover}
          onDelete={() => deleteBlock(popover.blockId)}
          onStartSession={handleStartSession}
          hasActiveSession={!!activeSession}
          popoverRef={popoverRef}
        />
      )}
    </div>
  )
}
