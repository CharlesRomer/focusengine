import { useState } from 'react'
import { format, addDays, addWeeks, addMonths, subDays, subWeeks, subMonths, startOfWeek } from 'date-fns'
import { todayLocal } from '@/lib/time'
import { TimelineDay } from '@/components/calendar/TimelineDay'
import { CalendarWeek } from '@/components/calendar/CalendarWeek'
import { CalendarMonth } from '@/components/calendar/CalendarMonth'

type View = 'day' | 'week' | 'month'

export function CalendarScreen() {
  const [view, setView] = useState<View>('day')
  const [currentDate, setCurrentDate] = useState(todayLocal())

  function navigate(dir: 1 | -1) {
    const d = new Date(currentDate + 'T12:00:00')
    if (view === 'day')   setCurrentDate(format(dir > 0 ? addDays(d, 1) : subDays(d, 1), 'yyyy-MM-dd'))
    if (view === 'week')  setCurrentDate(format(dir > 0 ? addWeeks(d, 1) : subWeeks(d, 1), 'yyyy-MM-dd'))
    if (view === 'month') setCurrentDate(format(dir > 0 ? addMonths(d, 1) : subMonths(d, 1), 'yyyy-MM-dd'))
  }

  const weekStart = startOfWeek(new Date(currentDate + 'T12:00:00'), { weekStartsOn: 0 })

  function title() {
    const d = new Date(currentDate + 'T12:00:00')
    if (view === 'day')   return format(d, 'EEEE, MMMM d, yyyy')
    if (view === 'week')  return `Week of ${format(weekStart, 'MMM d, yyyy')}`
    if (view === 'month') return format(d, 'MMMM yyyy')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
        borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
        background: 'var(--bg-surface)',
      }}>
        {/* View tabs */}
        <div style={{
          display: 'flex', background: 'var(--bg-base)',
          borderRadius: 'var(--radius-md)', padding: 3, gap: 2,
        }}>
          {(['day', 'week', 'month'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 'var(--text-sm)', fontWeight: 500, transition: 'all 150ms',
                background: view === v ? 'var(--bg-elevated)' : 'transparent',
                color: view === v ? 'var(--text-primary)' : 'var(--text-tertiary)',
              }}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {/* Nav */}
        <button onClick={() => navigate(-1)} style={navBtn}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)', minWidth: 200 }}>
          {title()}
        </span>
        <button onClick={() => navigate(1)} style={navBtn}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>

        {/* Today button */}
        <button
          onClick={() => setCurrentDate(todayLocal())}
          style={{
            marginLeft: 4, padding: '4px 10px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-default)', background: 'transparent',
            color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', cursor: 'pointer',
          }}
        >
          Today
        </button>
      </div>

      {/* Calendar body */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'day' && <TimelineDay date={currentDate} />}
        {view === 'week' && (
          <CalendarWeek
            weekStart={weekStart}
            onDayClick={d => { setCurrentDate(d); setView('day') }}
          />
        )}
        {view === 'month' && (
          <CalendarMonth
            month={new Date(currentDate + 'T12:00:00')}
            onDayClick={d => { setCurrentDate(d); setView('day') }}
          />
        )}
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)',
  background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
}
