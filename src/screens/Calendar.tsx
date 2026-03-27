import { FocusCalendar } from '@/components/calendar/FocusCalendar'

export function CalendarScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <FocusCalendar showToolbar={true} initialView="timeGridDay" />
    </div>
  )
}
