import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  useDraggable,
} from '@dnd-kit/core'
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers'
import {
  format, addDays, differenceInDays, parseISO, isValid,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isSameDay, isWithinInterval,
} from 'date-fns'
import type { DBProject, DBTimelinePhase, DBSubProject } from '@/lib/board'
import { useTimelineData } from '@/hooks/useTimelineData'
import {
  useCreatePhase,
  useUpdatePhase,
  useDeletePhase,
  useUpdateProjectDates,
  useUpdateSubProjectDueDate,
  useUpdateSubProject,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
} from '@/hooks/useBoardMutations'
import { SubProjectPanel } from '@/components/board/SubProjectPanel'
import { useBoardData } from '@/hooks/useBoardData'

// ── Constants ──────────────────────────────────────────────────────────────────

const PHASE_COLORS = ['#7C6FE0', '#3DB87A', '#E0A052', '#5A9FE0', '#D95C5C', '#9B9A94']

type ZoomLevel = 'days' | 'weeks' | 'months' | 'calendar'
const PX_PER_DAY: Record<Exclude<ZoomLevel, 'calendar'>, number> = {
  days: 60,
  weeks: 20,
  months: 6,
}

const LABEL_WIDTH = 140
const ROW_HEIGHT_PROJECT = 48
const ROW_HEIGHT_PHASE = 56
const ROW_HEIGHT_SUB = 52
const CHIP_WIDTH = 160
const CHIP_HEIGHT = 40

const STATUS_BORDER: Record<string, string> = {
  not_started: 'var(--border-default)',
  in_progress: 'var(--accent)',
  blocked: 'var(--danger)',
  complete: 'var(--success)',
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function dateToStr(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

function safeParseISO(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = parseISO(s)
  return isValid(d) ? d : null
}

function daysBetween(a: Date, b: Date): number {
  return differenceInDays(b, a)
}

// ── Interval packing ──────────────────────────────────────────────────────────

function packIntoLanes<T extends { start: Date; end: Date }>(items: T[]): (T & { lane: number })[] {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime())
  const laneEnds: Date[] = []
  return sorted.map(item => {
    let lane = laneEnds.findIndex(end => end <= item.start)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(item.end) }
    else laneEnds[lane] = item.end
    return { ...item, lane }
  })
}

// ── Sub-project type ──────────────────────────────────────────────────────────

type SubWithCounts = DBSubProject & { taskTotal: number; taskComplete: number }

// ── PhaseResizeHandle — raw pointer events, NO @dnd-kit ──────────────────────

interface ResizeHandleProps {
  side: 'left' | 'right'
  color: string
  onDelta: (delta: number) => void
  onEnd: () => void
}

function PhaseResizeHandle({ side, color, onDelta, onEnd }: ResizeHandleProps) {
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const handleMove = (ev: PointerEvent) => { onDelta(ev.clientX - startX) }
    const handleUp = () => {
      onEnd()
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }, [onDelta, onEnd])

  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute',
        [side]: 0,
        top: 0,
        bottom: 0,
        width: 8,
        cursor: 'ew-resize',
        zIndex: 10,
        background: `${color}55`,
        borderRadius: side === 'left'
          ? 'var(--radius-md) 0 0 var(--radius-md)'
          : '0 var(--radius-md) var(--radius-md) 0',
      }}
    />
  )
}

// ── DraggablePhaseBar — drag on center zone, resize on handles ────────────────

interface DraggablePhaseBarProps {
  phase: DBTimelinePhase
  left: number
  width: number
  top: number
  pxPerDay: number
  onUpdate: (phaseId: string, updates: { start_date?: string; end_date?: string }) => void
  onContextMenu: (e: React.MouseEvent, phase: DBTimelinePhase) => void
}

function DraggablePhaseBar({ phase, left, width, top, pxPerDay, onUpdate, onContextMenu }: DraggablePhaseBarProps) {
  const [resizeDelta, setResizeDelta] = useState(0)
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null)
  const resizeDeltaRef = useRef(0)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `phase-${phase.id}`,
    data: { type: 'phase', phase },
    disabled: isResizing !== null,
  })

  // Compute display dimensions with live resize preview
  let displayLeft = transform ? left + transform.x : left
  let displayWidth = width
  if (isResizing === 'right') displayWidth = Math.max(pxPerDay, width + resizeDelta)
  if (isResizing === 'left') {
    displayLeft = left + resizeDelta
    displayWidth = Math.max(pxPerDay, width - resizeDelta)
  }

  // Right handle handlers
  const handleRightDelta = useCallback((delta: number) => {
    setIsResizing('right')
    resizeDeltaRef.current = delta
    setResizeDelta(delta)
  }, [])
  const handleRightEnd = useCallback(() => {
    const delta = resizeDeltaRef.current
    const days = Math.round(delta / pxPerDay)
    const end = safeParseISO(phase.end_date)
    const start = safeParseISO(phase.start_date)
    if (end && start) {
      const newEnd = addDays(end, days)
      const minEnd = addDays(start, 1)
      onUpdate(phase.id, { end_date: dateToStr(newEnd < minEnd ? minEnd : newEnd) })
    }
    resizeDeltaRef.current = 0
    setResizeDelta(0)
    setIsResizing(null)
  }, [pxPerDay, phase.id, phase.start_date, phase.end_date, onUpdate])

  // Left handle handlers
  const handleLeftDelta = useCallback((delta: number) => {
    setIsResizing('left')
    resizeDeltaRef.current = delta
    setResizeDelta(delta)
  }, [])
  const handleLeftEnd = useCallback(() => {
    const delta = resizeDeltaRef.current
    const days = Math.round(delta / pxPerDay)
    const start = safeParseISO(phase.start_date)
    const end = safeParseISO(phase.end_date)
    if (start && end) {
      const newStart = addDays(start, days)
      const maxStart = addDays(end, -1)
      onUpdate(phase.id, { start_date: dateToStr(newStart > maxStart ? maxStart : newStart) })
    }
    resizeDeltaRef.current = 0
    setResizeDelta(0)
    setIsResizing(null)
  }, [pxPerDay, phase.id, phase.start_date, phase.end_date, onUpdate])

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      onContextMenu={e => onContextMenu(e, phase)}
      style={{
        position: 'absolute',
        left: displayLeft,
        top,
        width: displayWidth,
        height: CHIP_HEIGHT,
        background: `${phase.color}26`,
        border: `1px solid ${phase.color}`,
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 16,
        paddingRight: 16,
        zIndex: isDragging ? 20 : 5,
        userSelect: 'none',
        boxShadow: isDragging ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: isDragging || isResizing ? 'none' : 'box-shadow 150ms ease',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Left resize handle */}
      <PhaseResizeHandle side="left" color={phase.color} onDelta={handleLeftDelta} onEnd={handleLeftEnd} />

      {/* Center drag zone — drag listeners only here */}
      <div
        {...listeners}
        style={{
          position: 'absolute',
          left: '20%',
          right: '20%',
          top: 0,
          bottom: 0,
          cursor: isDragging ? 'grabbing' : 'grab',
          zIndex: 2,
        }}
      />

      <span style={{
        color: 'var(--text-primary)',
        fontSize: 'var(--text-xs)',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        flex: 1,
        pointerEvents: 'none',
        zIndex: 1,
      }}>
        {phase.name}
      </span>

      {/* Right resize handle */}
      <PhaseResizeHandle side="right" color={phase.color} onDelta={handleRightDelta} onEnd={handleRightEnd} />
    </div>
  )
}

// ── SubProjectSpanBar — for subs with both start_date + due_date ──────────────

interface SubProjectSpanBarProps {
  sub: SubWithCounts
  left: number
  width: number
  top: number
  pxPerDay: number
  onUpdate: (subId: string, updates: { start_date?: string | null; due_date?: string | null }) => void
  onClick: () => void
  onContextMenu: (e: React.MouseEvent, sub: DBSubProject) => void
  isDraggingThis: boolean
  dragDeltaDays: number
}

function SubProjectSpanBar({ sub, left, width, top, pxPerDay, onUpdate, onClick, onContextMenu, isDraggingThis, dragDeltaDays }: SubProjectSpanBarProps) {
  const [visualDelta, setVisualDelta] = useState(0)
  const [resizeSide, setResizeSide] = useState<'left' | 'right' | null>(null)
  const resizeDeltaRef = useRef(0)
  const borderColor = STATUS_BORDER[sub.status] ?? 'var(--border-default)'

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `sub-${sub.id}`,
    data: { type: 'sub-span', sub },
    disabled: resizeSide !== null,
  })

  let displayLeft = transform ? left + transform.x : left
  let displayWidth = width
  if (resizeSide === 'right') displayWidth = Math.max(pxPerDay, width + visualDelta)
  if (resizeSide === 'left') {
    displayLeft = left + visualDelta
    displayWidth = Math.max(pxPerDay, width - visualDelta)
  }

  const tooltipText = isDraggingThis && sub.start_date && sub.due_date
    ? `${format(addDays(parseISO(sub.start_date), dragDeltaDays), 'MMM d')} → ${format(addDays(parseISO(sub.due_date), dragDeltaDays), 'MMM d')}`
    : null

  const handleResizePointerDown = useCallback((side: 'left' | 'right') => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()

    const startX = e.clientX
    resizeDeltaRef.current = 0

    setResizeSide(side)
    setVisualDelta(0)

    const handleMove = (moveEvent: PointerEvent) => {
      const rawDelta = moveEvent.clientX - startX
      resizeDeltaRef.current = rawDelta
      setVisualDelta(rawDelta)
    }

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)

      const daysDelta = Math.round(resizeDeltaRef.current / pxPerDay)

      if (daysDelta !== 0) {
        const currentStart = parseISO(sub.start_date!)
        const currentEnd = parseISO(sub.due_date!)

        let newStart = currentStart
        let newEnd = currentEnd

        if (side === 'right') {
          newEnd = addDays(currentEnd, daysDelta)
          if (newEnd <= newStart) newEnd = addDays(newStart, 1)
        } else {
          newStart = addDays(currentStart, daysDelta)
          if (newStart >= newEnd) newStart = addDays(newEnd, -1)
        }

        onUpdate(sub.id, {
          start_date: format(newStart, 'yyyy-MM-dd'),
          due_date: format(newEnd, 'yyyy-MM-dd'),
        })
      }

      setResizeSide(null)
      setVisualDelta(0)
      resizeDeltaRef.current = 0
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }, [pxPerDay, sub, onUpdate])

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      onContextMenu={e => onContextMenu(e, sub)}
      onClick={e => { if (!transform) { e.stopPropagation(); onClick() } }}
      style={{
        position: 'absolute',
        left: displayLeft,
        top,
        width: displayWidth,
        height: CHIP_HEIGHT,
        background: 'var(--bg-elevated)',
        border: `1px solid ${borderColor}`,
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 16,
        paddingRight: 16,
        gap: 6,
        zIndex: transform ? 20 : 5,
        userSelect: 'none',
        boxShadow: transform ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: transform || resizeSide ? 'none' : 'box-shadow 150ms ease',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Left resize handle */}
      <div
        onPointerDown={handleResizePointerDown('left')}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: 'ew-resize',
          zIndex: 10,
          background: `${borderColor.startsWith('var') ? '#7C6FE0' : borderColor}55`,
          borderRadius: 'var(--radius-md) 0 0 var(--radius-md)',
        }}
      />

      {/* Center drag zone */}
      <div
        {...listeners}
        style={{
          position: 'absolute',
          left: '20%',
          right: '20%',
          top: 0,
          bottom: 0,
          cursor: transform ? 'grabbing' : 'grab',
          zIndex: 2,
        }}
      />

      {/* Status dot */}
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: borderColor, flexShrink: 0, zIndex: 1, pointerEvents: 'none' }} />

      <span style={{
        flex: 1,
        fontSize: 'var(--text-xs)',
        color: 'var(--text-secondary)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        zIndex: 1,
        pointerEvents: 'none',
      }}>
        {sub.name}
      </span>

      {sub.taskTotal > 0 && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', flexShrink: 0, zIndex: 1, pointerEvents: 'none' }}>
          {sub.taskComplete}/{sub.taskTotal}
        </span>
      )}

      {/* Right resize handle */}
      <div
        onPointerDown={handleResizePointerDown('right')}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: 'ew-resize',
          zIndex: 10,
          background: `${borderColor.startsWith('var') ? '#7C6FE0' : borderColor}55`,
          borderRadius: '0 var(--radius-md) var(--radius-md) 0',
        }}
      />

      {/* Date tooltip during drag */}
      {tooltipText && (
        <div style={{
          position: 'absolute',
          bottom: CHIP_HEIGHT + 4,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--accent)',
          fontSize: 'var(--text-xs)',
          padding: '2px 6px',
          whiteSpace: 'nowrap',
          zIndex: 30,
          pointerEvents: 'none',
        }}>
          {tooltipText}
        </div>
      )}
    </div>
  )
}

// ── DraggableChip — point chip for subs with only due_date ────────────────────

interface DraggableChipProps {
  sub: SubWithCounts
  centerX: number
  top: number
  dragDeltaDays: number
  isDraggingThis: boolean
  onClick: () => void
  onContextMenu: (e: React.MouseEvent, sub: DBSubProject) => void
}

function DraggableChip({ sub, centerX, top, dragDeltaDays, isDraggingThis, onClick, onContextMenu }: DraggableChipProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `sub-${sub.id}`,
    data: { type: 'sub', sub },
  })

  const currentCenter = transform ? centerX + transform.x : centerX
  const left = currentCenter - CHIP_WIDTH / 2
  const borderColor = STATUS_BORDER[sub.status] ?? 'var(--border-default)'

  const displayDate = isDraggingThis && sub.due_date
    ? format(addDays(parseISO(sub.due_date), dragDeltaDays), 'MMM d')
    : null

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onContextMenu={e => onContextMenu(e, sub)}
      onClick={(e) => { if (!transform) { e.stopPropagation(); onClick() } }}
      style={{
        position: 'absolute',
        left,
        top,
        width: CHIP_WIDTH,
        height: CHIP_HEIGHT,
        background: 'var(--bg-elevated)',
        border: `1px solid ${borderColor}`,
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        gap: 6,
        cursor: transform ? 'grabbing' : 'grab',
        zIndex: transform ? 20 : 5,
        userSelect: 'none',
        boxShadow: transform ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: transform ? 'none' : 'box-shadow 150ms ease',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: borderColor, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>
        {sub.name}
      </span>
      {sub.taskTotal > 0 && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', flexShrink: 0, pointerEvents: 'none' }}>
          {sub.taskComplete}/{sub.taskTotal}
        </span>
      )}
      {displayDate && (
        <div style={{
          position: 'absolute',
          bottom: CHIP_HEIGHT + 4,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--accent)',
          fontSize: 'var(--text-xs)',
          padding: '2px 6px',
          whiteSpace: 'nowrap',
          zIndex: 30,
          pointerEvents: 'none',
        }}>
          {displayDate}
        </div>
      )}
    </div>
  )
}

// ── Popover modals ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-primary)',
  fontSize: 'var(--text-sm)',
  padding: '7px 10px',
  outline: 'none',
  boxSizing: 'border-box',
  marginBottom: 10,
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--text-tertiary)',
  fontSize: 'var(--text-xs)',
  marginBottom: 4,
}

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  zIndex: 50,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const modalBoxStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  borderRadius: 'var(--radius-lg)',
  padding: 20,
  width: 320,
  boxShadow: 'var(--shadow-lg)',
}

function AddPhasePopover({ projectStart, onClose, onSubmit }: {
  projectStart: Date
  onClose: () => void
  onSubmit: (name: string, color: string, start_date: string, end_date: string) => void
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PHASE_COLORS[0])
  const [startDate, setStartDate] = useState(dateToStr(projectStart))
  const [endDate, setEndDate] = useState(dateToStr(addDays(projectStart, 30)))

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalBoxStyle} onClick={e => e.stopPropagation()}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 12, fontWeight: 500 }}>New Phase</p>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') onClose() }} placeholder="Phase name…" style={inputStyle} />
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Color</label>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {PHASE_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: 'none', outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: 2, cursor: 'pointer' }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Start</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>End</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }} /></div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { if (name.trim() && startDate && endDate) onSubmit(name.trim(), color, startDate, endDate) }} disabled={!name.trim() || !startDate || !endDate} style={{ flex: 1, background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 'var(--text-sm)', padding: '7px', cursor: 'pointer', opacity: name.trim() ? 1 : 0.5 }}>Create</button>
          <button onClick={onClose} style={{ flex: 1, background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', padding: '7px', cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function EditPhasePopover({ phase, onClose, onSubmit }: {
  phase: DBTimelinePhase
  onClose: () => void
  onSubmit: (updates: { name: string; color: string; start_date: string; end_date: string }) => void
}) {
  const [name, setName] = useState(phase.name)
  const [color, setColor] = useState(phase.color)
  const [startDate, setStartDate] = useState(phase.start_date)
  const [endDate, setEndDate] = useState(phase.end_date)

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalBoxStyle} onClick={e => e.stopPropagation()}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 12, fontWeight: 500 }}>Edit Phase</p>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') onClose() }} placeholder="Phase name…" style={inputStyle} />
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Color</label>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {PHASE_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: 'none', outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: 2, cursor: 'pointer' }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Start</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>End</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }} /></div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { if (name.trim() && startDate && endDate) onSubmit({ name: name.trim(), color, start_date: startDate, end_date: endDate }) }} disabled={!name.trim()} style={{ flex: 1, background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 'var(--text-sm)', padding: '7px', cursor: 'pointer', opacity: name.trim() ? 1 : 0.5 }}>Save</button>
          <button onClick={onClose} style={{ flex: 1, background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', padding: '7px', cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function SetProjectDatesPopover({ onClose, onSave }: { onClose: () => void; onSave: (start: string, end: string) => void }) {
  const [start, setStart] = useState(dateToStr(new Date()))
  const [end, setEnd] = useState(dateToStr(addDays(new Date(), 90)))
  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={{ ...modalBoxStyle, width: 300 }} onClick={e => e.stopPropagation()}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 12, fontWeight: 500 }}>Set Project Dates</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Start</label><input type="date" value={start} onChange={e => setStart(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>End</label><input type="date" value={end} onChange={e => setEnd(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }} /></div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { if (start && end) onSave(start, end) }} disabled={!start || !end} style={{ flex: 1, background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 'var(--text-sm)', padding: '7px', cursor: 'pointer' }}>Save</button>
          <button onClick={onClose} style={{ flex: 1, background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', padding: '7px', cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Unscheduled row ───────────────────────────────────────────────────────────

function UnscheduledRow({ sub, onSetDates }: {
  sub: SubWithCounts
  onSetDates: (startDate: string | null, dueDate: string) => void
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [startVal, setStartVal] = useState('')
  const [dueVal, setDueVal] = useState(dateToStr(new Date()))
  const borderColor = STATUS_BORDER[sub.status] ?? 'var(--border-default)'

  return (
    <div style={{ minHeight: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: borderColor, flexShrink: 0 }} />
      <span style={{ flex: 1, color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>{sub.name}</span>
      {sub.taskTotal > 0 && (
        <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', flexShrink: 0 }}>{sub.taskComplete}/{sub.taskTotal}</span>
      )}
      {showPicker ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={{ ...labelStyle, marginBottom: 1 }}>Start (opt.)</label>
            <input type="date" value={startVal} onChange={e => setStartVal(e.target.value)} style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 'var(--text-xs)', padding: '2px 6px', outline: 'none', colorScheme: 'dark' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={{ ...labelStyle, marginBottom: 1 }}>Due *</label>
            <input type="date" value={dueVal} onChange={e => setDueVal(e.target.value)} style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 'var(--text-xs)', padding: '2px 6px', outline: 'none', colorScheme: 'dark' }} />
          </div>
          <button
            onClick={() => { if (dueVal) { onSetDates(startVal || null, dueVal); setShowPicker(false) } }}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'white', fontSize: 'var(--text-xs)', padding: '4px 10px', cursor: 'pointer', flexShrink: 0 }}
          >
            Set
          </button>
          <button onClick={() => setShowPicker(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', cursor: 'pointer', padding: '2px' }}>×</button>
        </div>
      ) : (
        <button onClick={() => setShowPicker(true)} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', padding: '3px 10px', cursor: 'pointer', flexShrink: 0 }}>
          + Set date
        </button>
      )}
    </div>
  )
}

// ── Calendar View ─────────────────────────────────────────────────────────────

interface CalendarViewProps {
  phases: DBTimelinePhase[]
  subProjects: SubWithCounts[]
  onSubProjectClick: (id: string) => void
  currentMonth: Date
  onMonthChange: (d: Date) => void
}

function CalendarView({ phases, subProjects, onSubProjectClick, currentMonth, onMonthChange }: CalendarViewProps) {
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })
  const today = new Date()

  // Stats
  const dueThisMonth = subProjects.filter(s => s.due_date && isSameMonth(parseISO(s.due_date), currentMonth)).length
  const activePhasesThisMonth = phases.filter(p => {
    const ps = safeParseISO(p.start_date)
    const pe = safeParseISO(p.end_date)
    if (!ps || !pe) return false
    return ps <= monthEnd && pe >= monthStart
  }).length
  const overdue = subProjects.filter(s => {
    if (!s.due_date || s.status === 'complete') return false
    return parseISO(s.due_date) < today
  }).length

  // suppress unused warning — onMonthChange is used by parent toolbar
  void onMonthChange

  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, padding: '8px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>📅 {dueThisMonth} due this month</span>
        {overdue > 0 && <span style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>⚠ {overdue} overdue</span>}
        <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>▣ {activePhasesThisMonth} phases active</span>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} style={{ padding: '6px 8px', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', textAlign: 'center', fontWeight: 500 }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto' }} className="timeline-scroll">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: 'minmax(100px, auto)' }}>
          {days.map(day => {
            const dayKey = dateToStr(day)
            const isToday = isSameDay(day, today)
            const isCurrentMonth = isSameMonth(day, currentMonth)
            const isExpanded = expandedDay === dayKey

            // Phase bands for this day
            const dayPhases = phases.filter(p => {
              const ps = safeParseISO(p.start_date)
              const pe = safeParseISO(p.end_date)
              if (!ps || !pe) return false
              return isWithinInterval(day, { start: ps, end: pe })
            })

            // Sub-project chips for this day (due_date match, or start_date if no due_date)
            const daySubs = subProjects.filter(s => {
              if (s.due_date && isSameDay(parseISO(s.due_date), day)) return true
              if (!s.due_date && s.start_date && isSameDay(parseISO(s.start_date), day)) return true
              return false
            })

            const allItems = [
              ...dayPhases.map(p => ({ type: 'phase' as const, phase: p })),
              ...daySubs.map(s => ({ type: 'sub' as const, sub: s })),
            ]

            const SHOW_LIMIT = 3
            const visibleItems = isExpanded ? allItems : allItems.slice(0, SHOW_LIMIT)
            const hiddenCount = allItems.length - SHOW_LIMIT

            return (
              <div
                key={dayKey}
                style={{
                  border: '1px solid var(--border-subtle)',
                  background: isToday ? 'rgba(124,111,224,0.06)' : 'var(--bg-base)',
                  padding: '4px 6px',
                  minHeight: 100,
                  position: 'relative',
                  opacity: isCurrentMonth ? 1 : 0.4,
                }}
              >
                {/* Day number */}
                <div style={{ color: isToday ? 'var(--accent)' : 'var(--text-tertiary)', fontSize: 'var(--text-xs)', textAlign: 'right', marginBottom: 4, fontWeight: isToday ? 500 : undefined }}>
                  {format(day, 'd')}
                </div>

                {/* Items */}
                {visibleItems.map((item, i) => {
                  if (item.type === 'phase') {
                    const p = item.phase
                    return (
                      <div
                        key={`phase-${p.id}-${i}`}
                        title={p.name}
                        style={{
                          height: 6,
                          background: p.color,
                          borderRadius: 2,
                          marginBottom: 3,
                          width: '100%',
                        }}
                      />
                    )
                  } else {
                    const s = item.sub
                    const bc = STATUS_BORDER[s.status] ?? 'var(--border-default)'
                    return (
                      <button
                        key={`sub-${s.id}-${i}`}
                        onClick={() => onSubProjectClick(s.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          width: '100%',
                          background: 'var(--bg-surface)',
                          border: `1px solid ${bc}`,
                          borderRadius: 'var(--radius-sm)',
                          padding: '2px 5px',
                          marginBottom: 3,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: bc, flexShrink: 0 }} />
                        <span style={{ color: 'var(--text-secondary)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s.name}</span>
                      </button>
                    )
                  }
                })}

                {/* + X more */}
                {!isExpanded && hiddenCount > 0 && (
                  <button
                    onClick={() => setExpandedDay(dayKey)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', cursor: 'pointer', padding: '1px 0', display: 'block' }}
                  >
                    + {hiddenCount} more
                  </button>
                )}
                {isExpanded && allItems.length > SHOW_LIMIT && (
                  <button
                    onClick={() => setExpandedDay(null)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', cursor: 'pointer', padding: '1px 0', display: 'block' }}
                  >
                    Show less
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Timeline Toolbar ──────────────────────────────────────────────────────────

interface TimelineToolbarProps {
  zoom: ZoomLevel
  onZoomChange: (z: ZoomLevel) => void
  onAddPhase: () => void
  onJumpToToday: () => void
  hasDates: boolean
  calendarMonth: Date
  onCalendarPrev: () => void
  onCalendarNext: () => void
}

function TimelineToolbar({ zoom, onZoomChange, onAddPhase, onJumpToToday, hasDates, calendarMonth, onCalendarPrev, onCalendarNext }: TimelineToolbarProps) {
  const isCalendar = zoom === 'calendar'
  return (
    <div style={{ height: 40, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, flexShrink: 0 }}>
      {/* Zoom switcher (hidden for calendar) */}
      {!isCalendar && (
        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          {(['days', 'weeks', 'months'] as const).map((z, i, arr) => (
            <button
              key={z}
              onClick={() => onZoomChange(z)}
              style={{
                background: zoom === z ? 'var(--bg-active)' : 'none',
                border: 'none',
                borderRight: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                color: zoom === z ? 'var(--text-primary)' : 'var(--text-tertiary)',
                fontSize: 'var(--text-xs)',
                padding: '4px 10px',
                cursor: 'pointer',
                textTransform: 'capitalize',
                transition: 'background 150ms ease, color 150ms ease',
              }}
            >
              {z.charAt(0).toUpperCase() + z.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Calendar navigation (shown only in calendar view) */}
      {isCalendar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onCalendarPrev} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', padding: '3px 8px', cursor: 'pointer' }}>‹</button>
          <span style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontWeight: 500, minWidth: 120, textAlign: 'center' }}>
            {format(calendarMonth, 'MMMM yyyy')}
          </span>
          <button onClick={onCalendarNext} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', padding: '3px 8px', cursor: 'pointer' }}>›</button>
        </div>
      )}

      {/* Calendar view button */}
      <button
        onClick={() => onZoomChange('calendar')}
        style={{
          background: zoom === 'calendar' ? 'var(--bg-active)' : 'none',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          color: zoom === 'calendar' ? 'var(--text-primary)' : 'var(--text-tertiary)',
          fontSize: 'var(--text-xs)',
          padding: '4px 10px',
          cursor: 'pointer',
          transition: 'background 150ms ease, color 150ms ease',
        }}
      >
        Calendar
      </button>

      <div style={{ flex: 1 }} />

      {hasDates && !isCalendar && (
        <>
          <button onClick={onAddPhase} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', padding: '4px 10px', cursor: 'pointer' }}>
            + Phase
          </button>
          <button onClick={onJumpToToday} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', padding: '4px 10px', cursor: 'pointer' }}>
            Jump to today
          </button>
        </>
      )}
      {hasDates && isCalendar && (
        <button onClick={onAddPhase} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', padding: '4px 10px', cursor: 'pointer' }}>
          + Phase
        </button>
      )}
    </div>
  )
}

// ── Context menu item ─────────────────────────────────────────────────────────

const ctxMenuItemStyle: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
  color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', padding: '6px 12px', cursor: 'pointer',
}

// ── Main TimelineView ─────────────────────────────────────────────────────────

interface TimelineViewProps {
  projectId: string
  project: DBProject | null
  onSubProjectClick: (subProjectId: string) => void
}

export function TimelineView({ projectId, project: projectProp, onSubProjectClick }: TimelineViewProps) {
  const [zoom, setZoom] = useState<ZoomLevel>('weeks')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [showAddPhase, setShowAddPhase] = useState(false)
  const [editPhase, setEditPhase] = useState<DBTimelinePhase | null>(null)
  const [showSetDates, setShowSetDates] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; phase: DBTimelinePhase } | null>(null)
  const [subContextMenu, setSubContextMenu] = useState<{ x: number; y: number; sub: DBSubProject } | null>(null)
  const [unscheduledOpen, setUnscheduledOpen] = useState(true)
  const [dragDeltaDays, setDragDeltaDays] = useState(0)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [panelSubId, setPanelSubId] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: tlData, isLoading } = useTimelineData(projectId)
  const { data: boardData } = useBoardData(projectId)

  const createPhase = useCreatePhase(projectId)
  const updatePhase = useUpdatePhase(projectId)
  const deletePhase = useDeletePhase(projectId)
  const updateProjectDates = useUpdateProjectDates(projectId)
  const updateSubDueDate = useUpdateSubProjectDueDate(projectId)
  const updateSub = useUpdateSubProject(projectId)
  const createTask = useCreateTask(projectId)
  const updateTask = useUpdateTask(projectId)
  const deleteTask = useDeleteTask(projectId)

  const isCalendar = zoom === 'calendar'
  const pxPerDay = isCalendar ? 20 : PX_PER_DAY[zoom as Exclude<ZoomLevel, 'calendar'>]

  const proj = tlData?.project ?? projectProp

  const timelineRange = useMemo(() => {
    if (!proj?.start_date || !proj?.end_date) return null
    const start = safeParseISO(proj.start_date)
    const end = safeParseISO(proj.end_date)
    if (!start || !end) return null
    const paddedStart = addDays(start, -14)
    const paddedEnd = addDays(end, 14)
    const totalDays = daysBetween(paddedStart, paddedEnd)
    return { start: paddedStart, end: paddedEnd, totalDays }
  }, [proj?.start_date, proj?.end_date])

  const containerWidth = timelineRange ? timelineRange.totalDays * pxPerDay : 0

  const dateToX = useCallback((date: Date): number => {
    if (!timelineRange) return 0
    return daysBetween(timelineRange.start, date) * pxPerDay
  }, [timelineRange, pxPerDay])

  const todayX = useMemo(() => {
    if (!timelineRange) return null
    return dateToX(new Date())
  }, [timelineRange, dateToX])

  // Packed phases
  const packedPhases = useMemo(() => {
    if (!tlData?.phases || !timelineRange) return []
    return packIntoLanes(tlData.phases.map(p => ({
      ...p,
      start: safeParseISO(p.start_date) ?? timelineRange.start,
      end: safeParseISO(p.end_date) ?? timelineRange.end,
    })))
  }, [tlData?.phases, timelineRange])

  const phaseLaneCount = Math.max(1, packedPhases.length > 0 ? Math.max(...packedPhases.map(p => p.lane)) + 1 : 1)
  const phaseRowHeight = phaseLaneCount * ROW_HEIGHT_PHASE

  // Split sub-projects into span bars vs point chips vs unscheduled
  const { spanBars, pointChips, unscheduled } = useMemo(() => {
    const subs = tlData?.subProjects ?? []
    const spanBars = subs.filter(s => !!s.start_date && !!s.due_date)
    const pointChips = subs.filter(s => !s.start_date && !!s.due_date)
    const unscheduled = subs.filter(s => !s.due_date)
    return { spanBars, pointChips, unscheduled }
  }, [tlData?.subProjects])

  // Pack span bars
  const packedSpanBars = useMemo(() => {
    if (!timelineRange) return []
    return packIntoLanes(spanBars.map(s => ({
      ...s,
      start: safeParseISO(s.start_date!) ?? timelineRange.start,
      end: safeParseISO(s.due_date!) ?? timelineRange.end,
    })))
  }, [spanBars, timelineRange])

  // Pack point chips
  const packedChips = useMemo(() => {
    if (!timelineRange) return []
    return packIntoLanes(pointChips.map(s => {
      const due = safeParseISO(s.due_date!) ?? new Date()
      const chipHalfDays = Math.ceil((CHIP_WIDTH / 2) / pxPerDay)
      return { ...s, start: addDays(due, -chipHalfDays), end: addDays(due, chipHalfDays) }
    }))
  }, [pointChips, timelineRange, pxPerDay])

  const spanLaneCount = Math.max(1, packedSpanBars.length > 0 ? Math.max(...packedSpanBars.map(s => s.lane)) + 1 : 0)
  const chipLaneCount = Math.max(0, packedChips.length > 0 ? Math.max(...packedChips.map(c => c.lane)) + 1 : 0)
  const subRowHeight = Math.max(ROW_HEIGHT_SUB, (spanLaneCount + chipLaneCount) * ROW_HEIGHT_SUB)

  const totalHeight = ROW_HEIGHT_PROJECT + phaseRowHeight + subRowHeight + 32

  // Date ruler ticks
  const rulerTicks = useMemo(() => {
    if (!timelineRange) return []
    const ticks: { x: number; label: string }[] = []
    const { start, totalDays } = timelineRange
    let step = 1
    let labelFn = (d: Date) => format(d, 'd')
    if (zoom === 'weeks') { step = 7; labelFn = (d: Date) => format(d, 'MMM d') }
    if (zoom === 'months') { step = 30; labelFn = (d: Date) => format(d, 'MMM yyyy') }
    for (let i = 0; i <= totalDays; i += step) {
      ticks.push({ x: i * pxPerDay, label: labelFn(addDays(start, i)) })
    }
    return ticks
  }, [timelineRange, zoom, pxPerDay])

  const jumpToToday = useCallback(() => {
    if (todayX === null || !scrollRef.current) return
    const viewWidth = scrollRef.current.clientWidth
    scrollRef.current.scrollLeft = todayX - viewWidth / 2
  }, [todayX])

  useEffect(() => {
    if (todayX !== null && !isCalendar) {
      setTimeout(jumpToToday, 50)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, todayX !== null])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    setDragDeltaDays(Math.round(event.delta.x / pxPerDay))
    setActiveDragId(String(event.active.id))
  }, [pxPerDay])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDragDeltaDays(0)
    setActiveDragId(null)
    const { active, delta } = event
    const data = active.data.current
    if (!data) return
    const deltaDays = Math.round(delta.x / pxPerDay)
    if (deltaDays === 0) return

    if (data.type === 'phase') {
      const phase = data.phase as DBTimelinePhase
      const start = safeParseISO(phase.start_date)
      const end = safeParseISO(phase.end_date)
      if (!start || !end) return
      updatePhase.mutate({ id: phase.id, start_date: dateToStr(addDays(start, deltaDays)), end_date: dateToStr(addDays(end, deltaDays)) })
    } else if (data.type === 'sub') {
      const sub = data.sub as DBSubProject
      if (!sub.due_date) return
      const due = safeParseISO(sub.due_date)
      if (!due) return
      updateSubDueDate.mutate({ id: sub.id, due_date: dateToStr(addDays(due, deltaDays)) })
    } else if (data.type === 'sub-span') {
      const sub = data.sub as DBSubProject
      if (!sub.start_date || !sub.due_date) return
      const start = safeParseISO(sub.start_date)
      const due = safeParseISO(sub.due_date)
      if (!start || !due) return
      updateSubDueDate.mutate({ id: sub.id, start_date: dateToStr(addDays(start, deltaDays)), due_date: dateToStr(addDays(due, deltaDays)) })
    }
  }, [pxPerDay, updatePhase, updateSubDueDate])

  const handlePhaseUpdate = useCallback((phaseId: string, updates: { start_date?: string; end_date?: string }) => {
    updatePhase.mutate({ id: phaseId, ...updates })
  }, [updatePhase])

  const handleSubSpanUpdate = useCallback((subId: string, updates: { start_date?: string | null; due_date?: string | null }) => {
    updateSub.mutate({ id: subId, ...updates })
  }, [updateSub])

  const panelSub = useMemo(
    () => boardData?.subProjects.find(sp => sp.id === panelSubId) ?? null,
    [boardData, panelSubId]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setContextMenu(null); setSubContextMenu(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (isLoading) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>Loading timeline…</p></div>
  }

  // No project dates — show prompt
  if (!proj?.start_date || !proj?.end_date) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TimelineToolbar zoom={zoom} onZoomChange={setZoom} onAddPhase={() => setShowAddPhase(true)} onJumpToToday={jumpToToday} hasDates={false} calendarMonth={calendarMonth} onCalendarPrev={() => setCalendarMonth(d => addDays(startOfMonth(d), -1))} onCalendarNext={() => setCalendarMonth(d => addDays(endOfMonth(d), 1))} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>Set project start and end dates to enable the timeline.</p>
          <button onClick={() => setShowSetDates(true)} style={{ background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 'var(--text-sm)', padding: '8px 16px', cursor: 'pointer' }}>Set project dates →</button>
        </div>
        {showSetDates && <SetProjectDatesPopover onClose={() => setShowSetDates(false)} onSave={(s, e) => { updateProjectDates.mutate({ start_date: s, end_date: e }); setShowSetDates(false) }} />}
      </div>
    )
  }

  if (!timelineRange) return null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <TimelineToolbar
        zoom={zoom}
        onZoomChange={setZoom}
        onAddPhase={() => setShowAddPhase(true)}
        onJumpToToday={jumpToToday}
        hasDates={true}
        calendarMonth={calendarMonth}
        onCalendarPrev={() => setCalendarMonth(d => addDays(startOfMonth(d), -1))}
        onCalendarNext={() => setCalendarMonth(d => addDays(endOfMonth(d), 1))}
      />

      {/* Calendar view (display toggled) */}
      <div style={{ flex: 1, display: isCalendar ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
        <CalendarView
          phases={tlData?.phases ?? []}
          subProjects={tlData?.subProjects ?? []}
          onSubProjectClick={id => { onSubProjectClick(id); setPanelSubId(id) }}
          currentMonth={calendarMonth}
          onMonthChange={setCalendarMonth}
        />
      </div>

      {/* Scrollable timeline (display toggled) */}
      <div style={{ flex: 1, display: isCalendar ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Lane labels */}
          <div style={{ width: LABEL_WIDTH, flexShrink: 0, background: 'var(--bg-surface)', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', zIndex: 10, overflowY: 'hidden' }}>
            <div style={{ height: 32, borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }} />
            <div style={{ height: ROW_HEIGHT_PROJECT, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', fontWeight: 500 }}>PROJECT</span>
            </div>
            <div style={{ height: phaseRowHeight, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', fontWeight: 500 }}>PHASES</span>
            </div>
            <div style={{ height: subRowHeight, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', fontWeight: 500 }}>SUB-PROJECTS</span>
            </div>
          </div>

          {/* Scrollable canvas */}
          <div ref={scrollRef} className="timeline-scroll" style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
            <DndContext sensors={sensors} modifiers={[restrictToHorizontalAxis]} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
              <div style={{ width: containerWidth, minHeight: totalHeight, position: 'relative' }}>

                {/* Date ruler */}
                <div style={{ height: 32, position: 'sticky', top: 0, zIndex: 8, background: 'var(--bg-base)', borderBottom: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                  {rulerTicks.map((tick, i) => (
                    <div key={i} style={{ position: 'absolute', left: tick.x, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <div style={{ width: 1, height: 6, background: 'var(--border-subtle)' }} />
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', paddingLeft: 3, whiteSpace: 'nowrap' }}>{tick.label}</span>
                    </div>
                  ))}
                </div>

                {/* Today line */}
                {todayX !== null && todayX >= 0 && todayX <= containerWidth && (
                  <div style={{ position: 'absolute', left: todayX, top: 32, bottom: 0, width: 1.5, background: 'var(--accent)', opacity: 0.8, zIndex: 6, pointerEvents: 'none' }}>
                    <span style={{ position: 'absolute', top: 0, left: 3, color: 'var(--accent)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', fontWeight: 500 }}>Today</span>
                  </div>
                )}

                {/* Project bar row */}
                <div style={{ height: ROW_HEIGHT_PROJECT, position: 'relative', borderBottom: '1px solid var(--border-subtle)' }}>
                  {proj.start_date && proj.end_date && (() => {
                    const start = safeParseISO(proj.start_date)
                    const end = safeParseISO(proj.end_date)
                    if (!start || !end) return null
                    const left = dateToX(start)
                    const right = dateToX(addDays(end, 1))
                    return (
                      <div style={{ position: 'absolute', left, top: 8, width: right - left, height: ROW_HEIGHT_PROJECT - 16, background: `${proj.color}33`, border: `1px solid ${proj.color}`, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', paddingLeft: 10, overflow: 'hidden' }}>
                        <span style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{proj.name}</span>
                      </div>
                    )
                  })()}
                </div>

                {/* Phases swimlane */}
                <div style={{ height: phaseRowHeight, position: 'relative', borderBottom: '1px solid var(--border-subtle)' }}>
                  {packedPhases.map(phase => {
                    const start = safeParseISO(phase.start_date)
                    const end = safeParseISO(phase.end_date)
                    if (!start || !end) return null
                    const left = dateToX(start)
                    const right = dateToX(addDays(end, 1))
                    const width = Math.max(pxPerDay, right - left)
                    const top = phase.lane * ROW_HEIGHT_PHASE + (ROW_HEIGHT_PHASE - CHIP_HEIGHT) / 2
                    return (
                      <DraggablePhaseBar
                        key={phase.id}
                        phase={phase}
                        left={left}
                        width={width}
                        top={top}
                        pxPerDay={pxPerDay}
                        onUpdate={handlePhaseUpdate}
                        onContextMenu={(e, ph) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, phase: ph }) }}
                      />
                    )
                  })}
                </div>

                {/* Sub-projects swimlane */}
                <div style={{ height: subRowHeight, position: 'relative', borderBottom: '1px solid var(--border-subtle)' }}>
                  {/* Span bars */}
                  {packedSpanBars.map(sub => {
                    const start = safeParseISO(sub.start_date!)
                    const due = safeParseISO(sub.due_date!)
                    if (!start || !due) return null
                    const left = dateToX(start)
                    const right = dateToX(addDays(due, 1))
                    const width = Math.max(pxPerDay, right - left)
                    const top = sub.lane * ROW_HEIGHT_SUB + (ROW_HEIGHT_SUB - CHIP_HEIGHT) / 2
                    const isDraggingThis = activeDragId === `sub-${sub.id}`
                    return (
                      <SubProjectSpanBar
                        key={sub.id}
                        sub={sub}
                        left={left}
                        width={width}
                        top={top}
                        pxPerDay={pxPerDay}
                        onUpdate={handleSubSpanUpdate}
                        onClick={() => { onSubProjectClick(sub.id); setPanelSubId(sub.id) }}
                        onContextMenu={(e, s) => { e.preventDefault(); setSubContextMenu({ x: e.clientX, y: e.clientY, sub: s }) }}
                        isDraggingThis={isDraggingThis}
                        dragDeltaDays={isDraggingThis ? dragDeltaDays : 0}
                      />
                    )
                  })}
                  {/* Point chips — offset lanes below span bars */}
                  {packedChips.map(chip => {
                    const due = safeParseISO(chip.due_date!)
                    if (!due) return null
                    const centerX = dateToX(due)
                    const top = (spanLaneCount + chip.lane) * ROW_HEIGHT_SUB + (ROW_HEIGHT_SUB - CHIP_HEIGHT) / 2
                    const isDraggingThis = activeDragId === `sub-${chip.id}`
                    return (
                      <DraggableChip
                        key={chip.id}
                        sub={chip}
                        centerX={centerX}
                        top={top}
                        dragDeltaDays={isDraggingThis ? dragDeltaDays : 0}
                        isDraggingThis={isDraggingThis}
                        onClick={() => { onSubProjectClick(chip.id); setPanelSubId(chip.id) }}
                        onContextMenu={(e, s) => { e.preventDefault(); setSubContextMenu({ x: e.clientX, y: e.clientY, sub: s }) }}
                      />
                    )
                  })}
                </div>

              </div>
            </DndContext>
          </div>
        </div>

        {/* Unscheduled section */}
        {unscheduled.length > 0 && (
          <div style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <button
              onClick={() => setUnscheduledOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', height: 48, padding: '0 16px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', fontWeight: 500 }}
            >
              <span style={{ transform: unscheduledOpen ? 'rotate(90deg)' : 'none', transition: 'transform 150ms ease', display: 'inline-block', fontSize: 14 }}>›</span>
              Unscheduled ({unscheduled.length})
            </button>
            {unscheduledOpen && (
              <div style={{ maxHeight: 400, minHeight: 200, overflowY: 'auto', padding: '0 16px 12px' }} className="timeline-scroll">
                <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', marginBottom: 8 }}>
                  These sub-projects have no scheduled dates and won't appear on the timeline.
                </p>
                {unscheduled.map(sub => (
                  <UnscheduledRow
                    key={sub.id}
                    sub={sub}
                    onSetDates={(startDate, dueDate) => updateSubDueDate.mutate({ id: sub.id, start_date: startDate, due_date: dueDate })}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Phase context menu */}
      {contextMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 29 }} onClick={() => setContextMenu(null)} />
          <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', padding: '4px 0', zIndex: 30, minWidth: 140 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => { setEditPhase(contextMenu.phase); setContextMenu(null) }} style={ctxMenuItemStyle}>Edit</button>
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
            <button onClick={() => { deletePhase.mutate(contextMenu.phase.id); setContextMenu(null) }} style={{ ...ctxMenuItemStyle, color: 'var(--danger)' }}>Delete</button>
          </div>
        </>
      )}

      {/* Sub context menu */}
      {subContextMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 29 }} onClick={() => setSubContextMenu(null)} />
          <div style={{ position: 'fixed', top: subContextMenu.y, left: subContextMenu.x, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', padding: '4px 0', zIndex: 30, minWidth: 140 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => { setPanelSubId(subContextMenu.sub.id); onSubProjectClick(subContextMenu.sub.id); setSubContextMenu(null) }} style={ctxMenuItemStyle}>Open details</button>
            <button onClick={() => { updateSubDueDate.mutate({ id: subContextMenu.sub.id, due_date: null }); setSubContextMenu(null) }} style={ctxMenuItemStyle}>Remove due date</button>
          </div>
        </>
      )}

      {/* Modals */}
      {showAddPhase && <AddPhasePopover projectStart={safeParseISO(proj.start_date) ?? new Date()} onClose={() => setShowAddPhase(false)} onSubmit={(name, color, start_date, end_date) => { createPhase.mutate({ name, color, start_date, end_date, sort_order: tlData?.phases.length ?? 0 }); setShowAddPhase(false) }} />}
      {editPhase && <EditPhasePopover phase={editPhase} onClose={() => setEditPhase(null)} onSubmit={updates => { updatePhase.mutate({ id: editPhase.id, ...updates }); setEditPhase(null) }} />}
      {showSetDates && <SetProjectDatesPopover onClose={() => setShowSetDates(false)} onSave={(s, e) => { updateProjectDates.mutate({ start_date: s, end_date: e }); setShowSetDates(false) }} />}

      {/* Sub-project side panel */}
      {panelSub && boardData && (
        <SubProjectPanel
          subProject={panelSub}
          members={boardData.members}
          onClose={() => setPanelSubId(null)}
          onUpdate={updates => updateSub.mutate({ id: panelSub.id, ...updates })}
          onAddTask={title => createTask.mutate({ sub_project_id: panelSub.id, title, sort_order: panelSub.tasks.length })}
          onUpdateTask={(taskId, updates) => updateTask.mutate({ id: taskId, ...updates })}
          onDeleteTask={taskId => deleteTask.mutate(taskId)}
          onDelete={() => setPanelSubId(null)}
        />
      )}
    </div>
  )
}
