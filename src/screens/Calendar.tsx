// Calendar screen
// Day view  → TeamCalendarDay (multi-column, all team members)
// Week/Month → FocusCalendar (single user, existing behaviour)
//
// Custom toolbar owns: view toggle + prev/next/today navigation.
// FocusCalendar runs with showToolbar=false when embedded here.

import { useState } from 'react'
import {
  addDays, subDays, addWeeks, subWeeks, addMonths, subMonths,
  startOfWeek, endOfWeek, format, isSameDay,
} from 'date-fns'
import { FocusCalendar } from '@/components/calendar/FocusCalendar'
import { TeamCalendarDay } from '@/components/calendar/TeamCalendarDay'

type CalView = 'day' | 'week' | 'month'

// ── Toolbar ───────────────────────────────────────────────────────
interface ToolbarProps {
  view:         CalView
  date:         Date
  onViewChange: (v: CalView) => void
  onPrev:       () => void
  onNext:       () => void
  onToday:      () => void
}

function CalendarToolbar({ view, date, onViewChange, onPrev, onNext, onToday }: ToolbarProps) {
  const isToday = isSameDay(date, new Date())

  let dateLabel: string
  if (view === 'day') {
    dateLabel = format(date, 'EEEE, MMMM d')
  } else if (view === 'week') {
    const s = startOfWeek(date, { weekStartsOn: 1 })
    const e = endOfWeek(date,   { weekStartsOn: 1 })
    const sameMo = s.getMonth() === e.getMonth()
    dateLabel = sameMo
      ? `${format(s, 'MMM d')} – ${format(e, 'd, yyyy')}`
      : `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`
  } else {
    dateLabel = format(date, 'MMMM yyyy')
  }

  const btnBase: React.CSSProperties = {
    padding: '5px 13px',
    background: 'none',
    border: '1px solid var(--border-default)',
    borderRadius: 6,
    color: 'var(--text-secondary)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    transition: 'background 120ms',
  }
  const viewActive: React.CSSProperties = {
    ...btnBase,
    background: 'var(--accent-subtle)',
    border: '1px solid var(--accent)',
    color: 'var(--accent)',
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 16px 8px',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border-subtle)',
      flexShrink: 0,
    }}>
      {/* View toggle */}
      <div style={{ display: 'flex', gap: 2 }}>
        {(['day', 'week', 'month'] as CalView[]).map(v => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            style={view === v ? viewActive : btnBase}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Navigation */}
      <button onClick={onPrev} style={{ ...btnBase, padding: '5px 10px' }}>‹</button>
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', minWidth: 200, textAlign: 'center' }}>
        {dateLabel}
      </span>
      <button onClick={onNext} style={{ ...btnBase, padding: '5px 10px' }}>›</button>
      {!isToday && (
        <button onClick={onToday} style={btnBase}>Today</button>
      )}
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────
export function CalendarScreen() {
  const [view, setView] = useState<CalView>('day')
  const [date, setDate] = useState(new Date())

  function prev() {
    if (view === 'day')   setDate(d => subDays(d, 1))
    if (view === 'week')  setDate(d => subWeeks(d, 1))
    if (view === 'month') setDate(d => subMonths(d, 1))
  }
  function next() {
    if (view === 'day')   setDate(d => addDays(d, 1))
    if (view === 'week')  setDate(d => addWeeks(d, 1))
    if (view === 'month') setDate(d => addMonths(d, 1))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <CalendarToolbar
        view={view}
        date={date}
        onViewChange={setView}
        onPrev={prev}
        onNext={next}
        onToday={() => setDate(new Date())}
      />

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'day' && (
          <TeamCalendarDay date={date} />
        )}
        {view === 'week' && (
          <FocusCalendar
            key="week"
            showToolbar={false}
            initialView="timeGridWeek"
            externalDate={date}
          />
        )}
        {view === 'month' && (
          <FocusCalendar
            key="month"
            showToolbar={false}
            initialView="dayGridMonth"
            externalDate={date}
          />
        )}
      </div>
    </div>
  )
}
