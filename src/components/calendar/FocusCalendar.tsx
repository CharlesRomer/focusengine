import { useState, useRef, useEffect } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type {
  DateSelectArg,
  EventClickArg,
  EventChangeArg,
  DatesSetArg,
  EventContentArg,
} from '@fullcalendar/core'
import type { DropArg } from '@fullcalendar/interaction'
import { format } from 'date-fns'
import { useFocusBlocksRange } from '@/hooks/useFocusBlocks'
import { useCommitments } from '@/hooks/useCommitments'
import { useAuthStore } from '@/store/auth'
import { useSessionStore } from '@/store/session'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DBFocusSession } from '@/lib/supabase'
import { todayLocal } from '@/lib/time'
import { toast } from '@/store/ui'

interface GCalEvent {
  id: string
  summary: string
  start: string
  end: string
  isAllDay: boolean
}

// ── Helpers ───────────────────────────────────────────────────────
function addMinutesToTime(timeStr: string, mins: number): string {
  const [h, m] = timeStr.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.min(Math.floor(total / 60), 23)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const dh = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${dh}:${String(m).padStart(2, '0')}${suffix}`
}

function timeRangeLabel(start: string, end: string) {
  return `${fmt12(start)} – ${fmt12(end)}`
}

function extractDate(isoStr: string) {
  return isoStr.split('T')[0]
}

function extractTime(isoStr: string) {
  return isoStr.split('T')[1]?.slice(0, 5) ?? '00:00'
}

// ── GCal read-only tooltip ────────────────────────────────────────
interface GcalTooltipState {
  title: string
  timeLabel: string
  x: number
  y: number
}

function GcalTooltip({ state, onClose }: { state: GcalTooltipState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const W = 200, H = 70

  useEffect(() => {
    const t = setTimeout(() => {
      document.addEventListener('mousedown', (e) => {
        if (ref.current && !ref.current.contains(e.target as Node)) onClose()
      }, { once: true })
    }, 0)
    return () => clearTimeout(t)
  }, [onClose])

  const vw   = window.innerWidth
  const vh   = window.innerHeight
  const left = state.x + W > vw - 8 ? state.x - W - 8 : state.x + 8
  const top  = state.y + H > vh - 8 ? state.y - H     : state.y

  return (
    <div
      ref={ref}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: Math.max(8, left),
        top:  Math.max(8, top),
        width: W,
        zIndex: 1000,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        padding: '10px 12px',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 3 }}>
        {state.title}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{state.timeLabel}</div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, fontStyle: 'italic' }}>
        Google Calendar · read-only
      </div>
    </div>
  )
}

// ── Popover ───────────────────────────────────────────────────────
interface PopoverState {
  blockId: string
  timeLabel: string
  x: number
  y: number
}

interface BlockEditPopoverProps {
  state: PopoverState
  name: string
  onChange: (name: string) => void
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

  useEffect(() => {
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 30)
  }, [])

  const vw   = window.innerWidth
  const vh   = window.innerHeight
  const left = state.x + W > vw - 8 ? state.x - W - 8 : state.x + 8
  const top  = state.y + H > vh - 8 ? state.y - H     : state.y

  return (
    <div
      ref={popoverRef}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: Math.max(8, left),
        top: Math.max(8, top),
        width: W,
        zIndex: 1000,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        padding: '12px',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <input
        ref={inputRef}
        value={name}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter')  onClose(true)
          if (e.key === 'Escape') onClose(false)
        }}
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
          title={hasActiveSession ? 'End current session first' : 'Start a focus session'}
          style={{
            flex: 1, padding: '5px 0',
            background: hasActiveSession ? 'transparent' : 'var(--accent-subtle)',
            border: `1px solid ${hasActiveSession ? 'var(--border-default)' : 'var(--accent)'}`,
            borderRadius: 'var(--radius-md)',
            color: hasActiveSession ? 'var(--text-disabled)' : 'var(--accent)',
            fontSize: 'var(--text-xs)', fontWeight: 500,
            cursor: hasActiveSession ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-sans)',
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

// ── Custom event content ──────────────────────────────────────────
function renderEventContent(arg: EventContentArg) {
  const hasSession = !!arg.event.extendedProps?.sessionId
  return (
    <div style={{
      height: '100%',
      overflow: 'hidden',
      padding: '2px 5px 2px 7px',
      borderLeft: '2px solid rgba(255,255,255,0.35)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-start',
      gap: 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {hasSession && (
          <div style={{
            width: 5, height: 5,
            borderRadius: '50%',
            background: 'var(--success)',
            flexShrink: 0,
          }} />
        )}
        <span style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'white',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {arg.event.title}
        </span>
      </div>
      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.2 }}>
        {arg.timeText}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────
interface FocusCalendarProps {
  showToolbar?: boolean
  initialView?: string
  externalDate?: Date  // When set, calendar navigates to this date
}

export function FocusCalendar({ showToolbar = true, initialView = 'timeGridDay', externalDate }: FocusCalendarProps) {
  const user           = useAuthStore(s => s.user)
  const qc             = useQueryClient()
  const activeSession  = useSessionStore(s => s.activeSession)
  const setActive      = useSessionStore(s => s.setActiveSession)
  const { data: commitments } = useCommitments()

  const [dateRange, setDateRange] = useState({ start: todayLocal(), end: todayLocal() })

  const { data: focusBlocks = [] } = useFocusBlocksRange(dateRange.start, dateRange.end)

  // GCal events (only when connected)
  const gcalEnabled = !!user?.google_calendar_connected
  const { data: gcalEvents = [] } = useQuery<GCalEvent[]>({
    queryKey: ['gcal-events', user?.id, dateRange.start, dateRange.end],
    enabled: gcalEnabled,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-calendar-events', {
        body: {
          date_min: `${dateRange.start}T00:00:00Z`,
          date_max: `${dateRange.end}T23:59:59Z`,
        },
      })
      if (error) throw error
      return (data ?? []) as GCalEvent[]
    },
  })

  const [popover,      setPopover]     = useState<PopoverState | null>(null)
  const [popoverName,  setPopoverName] = useState('')
  const [gcalTooltip,  setGcalTooltip] = useState<GcalTooltipState | null>(null)
  const popoverRef     = useRef<HTMLDivElement>(null)
  const popoverNameRef = useRef('')

  const calendarRef = useRef<FullCalendar>(null)

  // Navigate calendar when externalDate changes (from Today tab date nav)
  useEffect(() => {
    if (!externalDate) return
    calendarRef.current?.getApi().gotoDate(externalDate)
  }, [externalDate])

  function handleNameChange(val: string) {
    setPopoverName(val)
    popoverNameRef.current = val
  }

  // Debounced name save
  useEffect(() => {
    if (!popover) return
    const id = setTimeout(() => {
      const val = popoverNameRef.current.trim()
      if (val) saveBlockName(popover.blockId, val)
    }, 500)
    return () => clearTimeout(id)
  }, [popoverName]) // eslint-disable-line react-hooks/exhaustive-deps

  // Outside-click closes popover
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
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [popover]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save helpers ──────────────────────────────────────────────
  async function saveBlockName(blockId: string, name: string) {
    const { error } = await supabase
      .from('focus_blocks')
      .update({ name })
      .eq('id', blockId)
    if (error) toast('Could not save block name', 'error')
    else qc.invalidateQueries({ queryKey: ['focus_blocks'] })
  }

  async function deleteBlock(blockId: string) {
    setPopover(null)
    const { error } = await supabase
      .from('focus_blocks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', blockId)
    if (error) toast('Could not delete block', 'error')
    else qc.invalidateQueries({ queryKey: ['focus_blocks'] })
  }

  async function handleStartSession() {
    if (!user || !popover) return

    const { data: existing } = await supabase
      .from('focus_sessions')
      .select('id')
      .eq('user_id', user.id)
      .in('status', ['active', 'paused'])
      .limit(1)
      .maybeSingle()

    if (existing) {
      toast('You already have an active session. End it before starting a new one.', 'error')
      setPopover(null)
      return
    }

    const sessionName = popoverNameRef.current.trim() || 'Focus block'
    const { data, error } = await supabase
      .from('focus_sessions')
      .insert({
        user_id:             user.id,
        team_org_id:         user.team_org_id ?? '',
        name:                sessionName,
        status:              'active',
        total_pause_seconds: 0,
        share_to_feed:       false,
      })
      .select()
      .single()
    if (error) { toast('Could not start session', 'error'); return }

    await supabase
      .from('focus_blocks')
      .update({ session_id: data.id })
      .eq('id', popover.blockId)

    void supabase.from('users').update({ active_session_id: data.id }).eq('id', user.id)

    setActive(data as DBFocusSession)
    qc.invalidateQueries({ queryKey: ['focus_blocks'] })
    toast('Session started — stay focused', 'success')
    setPopover(null)
  }

  // ── Popover open/close ───────────────────────────────────────
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

  // ── handleDatesSet ───────────────────────────────────────────
  function handleDatesSet(info: DatesSetArg) {
    const start   = format(info.start, 'yyyy-MM-dd')
    const endDate = new Date(info.end.getTime() - 1)
    const end     = format(endDate, 'yyyy-MM-dd')
    setDateRange({ start, end })
  }

  // ── handleSelect — create block ──────────────────────────────
  async function handleSelect(info: DateSelectArg) {
    info.view.calendar.unselect()

    const date      = extractDate(info.startStr)
    const startTime = extractTime(info.startStr)
    const endTime   = extractTime(info.endStr)

    const { data, error } = await supabase
      .from('focus_blocks')
      .insert({ user_id: user!.id, name: 'Focus block', date, start_time: startTime, end_time: endTime })
      .select()
      .single()

    if (error) { toast('Could not create block', 'error'); return }

    const isToday = date === todayLocal()
    if (isToday) {
      const active = (commitments ?? []).filter(c => !c.deleted_at)
      if (active.length < 3) {
        try {
          const { data: c, error: cErr } = await supabase
            .from('commitments')
            .insert({ user_id: user!.id, team_org_id: user!.team_org_id, date, text: 'Focus block' })
            .select().single()
          if (!cErr && c) {
            await supabase.from('focus_blocks').update({ commitment_id: c.id }).eq('id', data.id)
            qc.invalidateQueries({ queryKey: ['commitments'] })
          }
        } catch { /* non-fatal */ }
      } else {
        toast('Focus block created — commitment not added (you already have 3 for today)', 'info')
      }
    }

    qc.invalidateQueries({ queryKey: ['focus_blocks'] })

    const jsEvent = info.jsEvent
    openPopover(
      data.id, 'Focus block', timeRangeLabel(startTime, endTime),
      jsEvent ? jsEvent.clientX : 400,
      jsEvent ? jsEvent.clientY : 200,
    )
  }

  // ── handleEventClick — open popover ─────────────────────────
  function handleEventClick(info: EventClickArg) {
    // GCal events: show read-only tooltip only
    if (info.event.id.startsWith('gcal-')) {
      info.jsEvent?.preventDefault()
      const { start, end } = info.event
      const startStr = start ? format(start, 'HH:mm') : ''
      const endStr   = end   ? format(end,   'HH:mm') : ''
      const rect     = info.el.getBoundingClientRect()
      setGcalTooltip({
        title:     info.event.title,
        timeLabel: startStr && endStr ? timeRangeLabel(startStr, endStr) : '',
        x: rect.right + 8,
        y: rect.top,
      })
      return
    }
    const { start, end } = info.event
    const startStr = start ? format(start, 'HH:mm') : '00:00'
    const endStr   = end   ? format(end,   'HH:mm') : '00:00'
    const rect = info.el.getBoundingClientRect()
    openPopover(info.event.id, info.event.title, timeRangeLabel(startStr, endStr), rect.right + 8, rect.top)
  }

  // ── handleEventChange — drag / resize ───────────────────────
  async function handleEventChange(info: EventChangeArg) {
    const { error } = await supabase
      .from('focus_blocks')
      .update({
        date:       extractDate(info.event.startStr),
        start_time: extractTime(info.event.startStr),
        end_time:   extractTime(info.event.endStr ?? info.event.startStr),
      })
      .eq('id', info.event.id)

    if (error) { toast('Could not save changes', 'error'); info.revert(); return }

    if (popover?.blockId === info.event.id) {
      const s = info.event.start ? format(info.event.start, 'HH:mm') : '00:00'
      const e = info.event.end   ? format(info.event.end,   'HH:mm') : '00:00'
      setPopover(p => p ? { ...p, timeLabel: timeRangeLabel(s, e) } : null)
    }
    qc.invalidateQueries({ queryKey: ['focus_blocks'] })
  }

  // ── handleExternalDrop — commitment dragged onto calendar ────
  async function handleExternalDrop(info: DropArg) {
    const commitmentId   = info.draggedEl.dataset.commitmentId
    const commitmentText = info.draggedEl.dataset.commitmentText
    if (!commitmentId || !commitmentText) return

    const date      = extractDate(info.dateStr)
    const startTime = extractTime(info.dateStr) || '09:00'
    const endTime   = addMinutesToTime(startTime, 60)

    const { error } = await supabase
      .from('focus_blocks')
      .insert({
        user_id: user!.id, name: commitmentText, date,
        start_time: startTime, end_time: endTime, commitment_id: commitmentId,
      })
    if (error) toast('Could not create block', 'error')
    else qc.invalidateQueries({ queryKey: ['focus_blocks'] })
  }

  // ── Build calendar events ────────────────────────────────────
  const seenIds = new Set<string>()
  const blockEvents = focusBlocks
    .filter(b => { if (seenIds.has(b.id)) return false; seenIds.add(b.id); return true })
    .map(b => ({
      id:              b.id,
      title:           b.name,
      start:           `${b.date}T${b.start_time}`,
      end:             `${b.date}T${b.end_time}`,
      backgroundColor: 'var(--accent)',
      borderColor:     'transparent',
      editable:        true,
      extendedProps:   { commitmentId: b.commitment_id, horizonTag: b.horizon_tag, sessionId: b.session_id },
    }))

  const gcalCalendarEvents = gcalEvents.map(e => ({
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
  }))

  const calendarEvents = [...blockEvents, ...gcalCalendarEvents]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView={initialView}
          initialDate={todayLocal()}
          headerToolbar={showToolbar ? {
            left:   'prev,next today',
            center: 'title',
            right:  'timeGridDay,timeGridWeek,dayGridMonth',
          } : false}
          slotDuration="00:15:00"
          slotLabelInterval="01:00:00"
          slotMinTime="07:00:00"
          slotMaxTime="24:00:00"
          selectable={true}
          selectMirror={true}
          editable={true}
          eventResizableFromStart={true}
          snapDuration="00:15:00"
          droppable={true}
          nowIndicator={true}
          height="100%"
          expandRows={true}
          events={calendarEvents}
          eventContent={renderEventContent}
          datesSet={handleDatesSet}
          select={handleSelect}
          eventClick={handleEventClick}
          eventChange={handleEventChange}
          drop={handleExternalDrop}
          viewDidMount={(info) => {
            if (info.view.type.startsWith('timeGrid')) {
              const now    = new Date()
              const target = new Date(now.getTime() - 2 * 60 * 60 * 1000)
              const h      = String(target.getHours()).padStart(2, '0')
              const m      = String(target.getMinutes()).padStart(2, '0')
              info.view.calendar.scrollToTime(`${h}:${m}:00`)
            }
          }}
        />
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

      {gcalTooltip && (
        <GcalTooltip
          state={gcalTooltip}
          onClose={() => setGcalTooltip(null)}
        />
      )}
    </div>
  )
}
