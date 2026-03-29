import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core'
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers'
import { useDraggable } from '@dnd-kit/core'
import { format, addDays, differenceInDays, parseISO, isValid } from 'date-fns'
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

type ZoomLevel = 'days' | 'weeks' | 'months'
const PX_PER_DAY: Record<ZoomLevel, number> = {
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

// ── Status colors ──────────────────────────────────────────────────────────────

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

// ── Interval packing: assigns each item to a row (lane) with no overlap ────────

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

// ── Sub-project with task counts (from useTimelineData) ────────────────────────

type SubWithCounts = DBSubProject & { taskTotal: number; taskComplete: number }

// ── DraggablePhaseBar ─────────────────────────────────────────────────────────

interface DraggablePhaseBarProps {
  phase: DBTimelinePhase
  left: number
  width: number
  top: number
  pxPerDay: number
  onResizeDragEnd: (phaseId: string, newEndDate: string) => void
  onContextMenu: (e: React.MouseEvent, phase: DBTimelinePhase) => void
}

function DraggablePhaseBar({ phase, left, width, top, pxPerDay, onResizeDragEnd, onContextMenu }: DraggablePhaseBarProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `phase-${phase.id}`,
    data: { type: 'phase', phase },
  })

  const resizeRef = useRef<HTMLDivElement>(null)
  const resizingRef = useRef(false)
  const resizeStartXRef = useRef(0)
  const resizeStartEndRef = useRef<Date>(safeParseISO(phase.end_date) ?? new Date())

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    resizingRef.current = true
    resizeStartXRef.current = e.clientX
    resizeStartEndRef.current = safeParseISO(phase.end_date) ?? new Date()

    function onMove(ev: MouseEvent) {
      if (!resizingRef.current) return
      const deltaDays = Math.round((ev.clientX - resizeStartXRef.current) / pxPerDay)
      const startDate = safeParseISO(phase.start_date) ?? new Date()
      const newEnd = addDays(resizeStartEndRef.current, deltaDays)
      const minEnd = addDays(startDate, 1)
      const clampedEnd = newEnd < minEnd ? minEnd : newEnd
      if (resizeRef.current) {
        const newWidth = Math.max(pxPerDay, (daysBetween(startDate, clampedEnd) + 1) * pxPerDay)
        resizeRef.current.parentElement!.style.width = `${newWidth}px`
      }
    }
    function onUp(ev: MouseEvent) {
      resizingRef.current = false
      const deltaDays = Math.round((ev.clientX - resizeStartXRef.current) / pxPerDay)
      const startDate = safeParseISO(phase.start_date) ?? new Date()
      const newEnd = addDays(resizeStartEndRef.current, deltaDays)
      const minEnd = addDays(startDate, 1)
      const clampedEnd = newEnd < minEnd ? minEnd : newEnd
      onResizeDragEnd(phase.id, dateToStr(clampedEnd))
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [phase.id, phase.start_date, phase.end_date, pxPerDay, onResizeDragEnd])

  const currentLeft = transform ? left + transform.x : left

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onContextMenu={e => onContextMenu(e, phase)}
      style={{
        position: 'absolute',
        left: currentLeft,
        top,
        width,
        height: CHIP_HEIGHT,
        background: `${phase.color}26`,
        border: `1px solid ${phase.color}`,
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 8,
        paddingRight: 14,
        cursor: isDragging ? 'grabbing' : 'grab',
        zIndex: isDragging ? 20 : 5,
        userSelect: 'none',
        boxShadow: isDragging ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: isDragging ? 'none' : 'box-shadow 150ms ease, border-color 150ms ease',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <span style={{
        color: 'var(--text-primary)',
        fontSize: 'var(--text-xs)',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        flex: 1,
        pointerEvents: 'none',
      }}>
        {phase.name}
      </span>
      {/* Resize handle — right edge */}
      <div
        ref={resizeRef}
        onMouseDown={handleResizeMouseDown}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 8,
          background: `${phase.color}60`,
          cursor: 'col-resize',
          borderRadius: '0 var(--radius-md) var(--radius-md) 0',
        }}
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}

// ── DraggableSubProjectChip ────────────────────────────────────────────────────

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
        top: top + (CHIP_HEIGHT - CHIP_HEIGHT) / 2,
        width: CHIP_WIDTH,
        height: CHIP_HEIGHT,
        background: 'var(--bg-elevated)',
        border: `1px solid ${STATUS_BORDER[sub.status] ?? 'var(--border-default)'}`,
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        gap: 6,
        cursor: transform ? 'grabbing' : 'grab',
        zIndex: transform ? 20 : 5,
        userSelect: 'none',
        boxShadow: transform ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: transform ? 'none' : 'box-shadow 150ms ease, border-color 150ms ease',
        boxSizing: 'border-box',
      }}
    >
      {/* Status dot */}
      <div style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: STATUS_BORDER[sub.status] ?? 'var(--border-default)',
        flexShrink: 0,
      }} />
      <span style={{
        flex: 1,
        fontSize: 'var(--text-xs)',
        color: 'var(--text-secondary)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        pointerEvents: 'none',
      }}>
        {sub.name}
      </span>
      {sub.taskTotal > 0 && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', flexShrink: 0, pointerEvents: 'none' }}>
          {sub.taskComplete}/{sub.taskTotal}
        </span>
      )}
      {/* Date tooltip during drag */}
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

// ── Add Phase Popover ─────────────────────────────────────────────────────────

interface AddPhasePopoverProps {
  projectStart: Date
  onClose: () => void
  onSubmit: (name: string, color: string, start_date: string, end_date: string) => void
}

function AddPhasePopover({ projectStart, onClose, onSubmit }: AddPhasePopoverProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PHASE_COLORS[0])
  const [startDate, setStartDate] = useState(dateToStr(projectStart))
  const [endDate, setEndDate] = useState(dateToStr(addDays(projectStart, 30)))

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: 20, width: 320, boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 12, fontWeight: 500 }}>New Phase</p>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onClose() }}
          placeholder="Phase name…"
          style={inputStyle}
        />
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Color</label>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {PHASE_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 24, height: 24, borderRadius: '50%', background: c, border: 'none',
                  outline: color === c ? `2px solid ${c}` : 'none',
                  outlineOffset: 2, cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Start</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>End</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { if (name.trim() && startDate && endDate) onSubmit(name.trim(), color, startDate, endDate) }}
            disabled={!name.trim() || !startDate || !endDate}
            style={{ flex: 1, background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 'var(--text-sm)', padding: '7px', cursor: 'pointer', opacity: name.trim() ? 1 : 0.5 }}
          >
            Create
          </button>
          <button
            onClick={onClose}
            style={{ flex: 1, background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', padding: '7px', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Phase Popover ────────────────────────────────────────────────────────

interface EditPhasePopoverProps {
  phase: DBTimelinePhase
  onClose: () => void
  onSubmit: (updates: { name: string; color: string; start_date: string; end_date: string }) => void
}

function EditPhasePopover({ phase, onClose, onSubmit }: EditPhasePopoverProps) {
  const [name, setName] = useState(phase.name)
  const [color, setColor] = useState(phase.color)
  const [startDate, setStartDate] = useState(phase.start_date)
  const [endDate, setEndDate] = useState(phase.end_date)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: 20, width: 320, boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 12, fontWeight: 500 }}>Edit Phase</p>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onClose() }}
          placeholder="Phase name…"
          style={inputStyle}
        />
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Color</label>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {PHASE_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 24, height: 24, borderRadius: '50%', background: c, border: 'none',
                  outline: color === c ? `2px solid ${c}` : 'none',
                  outlineOffset: 2, cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Start</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>End</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { if (name.trim() && startDate && endDate) onSubmit({ name: name.trim(), color, start_date: startDate, end_date: endDate }) }}
            disabled={!name.trim() || !startDate || !endDate}
            style={{ flex: 1, background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 'var(--text-sm)', padding: '7px', cursor: 'pointer', opacity: name.trim() ? 1 : 0.5 }}
          >
            Save
          </button>
          <button
            onClick={onClose}
            style={{ flex: 1, background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', padding: '7px', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Set Project Dates Popover ──────────────────────────────────────────────────

interface SetProjectDatesPopoverProps {
  onClose: () => void
  onSave: (start: string, end: string) => void
}

function SetProjectDatesPopover({ onClose, onSave }: SetProjectDatesPopoverProps) {
  const today = dateToStr(new Date())
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(dateToStr(addDays(new Date(), 90)))

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: 20, width: 300, boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 12, fontWeight: 500 }}>Set Project Dates</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Start</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>End</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { if (start && end) onSave(start, end) }}
            disabled={!start || !end}
            style={{ flex: 1, background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 'var(--text-sm)', padding: '7px', cursor: 'pointer' }}
          >
            Save
          </button>
          <button onClick={onClose} style={{ flex: 1, background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', padding: '7px', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shared styles ──────────────────────────────────────────────────────────────

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

// ── Main TimelineView ─────────────────────────────────────────────────────────

interface TimelineViewProps {
  projectId: string
  project: DBProject | null
  onSubProjectClick: (subProjectId: string) => void
}

export function TimelineView({ projectId, project: projectProp, onSubProjectClick }: TimelineViewProps) {
  const [zoom, setZoom] = useState<ZoomLevel>('weeks')
  const [showAddPhase, setShowAddPhase] = useState(false)
  const [editPhase, setEditPhase] = useState<DBTimelinePhase | null>(null)
  const [showSetDates, setShowSetDates] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; phase: DBTimelinePhase } | null>(null)
  const [subContextMenu, setSubContextMenu] = useState<{ x: number; y: number; sub: DBSubProject } | null>(null)
  const [unscheduledOpen, setUnscheduledOpen] = useState(true)
  const [dragDeltaDays, setDragDeltaDays] = useState(0)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  // Data
  const { data: tlData, isLoading } = useTimelineData(projectId)
  // Also get board data for SubProjectPanel (members)
  const { data: boardData } = useBoardData(projectId)

  // Mutations
  const createPhase = useCreatePhase(projectId)
  const updatePhase = useUpdatePhase(projectId)
  const deletePhase = useDeletePhase(projectId)
  const updateProjectDates = useUpdateProjectDates(projectId)
  const updateSubDueDate = useUpdateSubProjectDueDate(projectId)
  const updateSub = useUpdateSubProject(projectId)
  const createTask = useCreateTask(projectId)
  const updateTask = useUpdateTask(projectId)
  const deleteTask = useDeleteTask(projectId)

  const pxPerDay = PX_PER_DAY[zoom]

  // Derive the effective project — merge prop (which may have stale data) with fresh TL data
  const proj = tlData?.project ?? projectProp

  // Compute timeline range
  const timelineRange = useMemo(() => {
    if (!proj?.start_date || !proj?.end_date) return null
    const start = safeParseISO(proj.start_date)
    const end = safeParseISO(proj.end_date)
    if (!start || !end) return null
    // Pad by 14 days on each side for visual breathing room
    const paddedStart = addDays(start, -14)
    const paddedEnd = addDays(end, 14)
    const totalDays = daysBetween(paddedStart, paddedEnd)
    return { start: paddedStart, end: paddedEnd, totalDays }
  }, [proj?.start_date, proj?.end_date])

  const containerWidth = timelineRange ? timelineRange.totalDays * pxPerDay : 0

  // Pixel position for a date
  const dateToX = useCallback((date: Date): number => {
    if (!timelineRange) return 0
    return daysBetween(timelineRange.start, date) * pxPerDay
  }, [timelineRange, pxPerDay])

  // Today line position
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

  // Scheduled / unscheduled sub-projects
  const { scheduled, unscheduled } = useMemo(() => {
    const subs = tlData?.subProjects ?? []
    const scheduled = subs.filter(s => !!s.due_date)
    const unscheduled = subs.filter(s => !s.due_date)
    return { scheduled, unscheduled }
  }, [tlData?.subProjects])

  // Packed sub-project chips
  const packedChips = useMemo(() => {
    if (!timelineRange) return []
    return packIntoLanes(scheduled.map(s => {
      const due = safeParseISO(s.due_date!) ?? new Date()
      const chipHalfDays = Math.ceil((CHIP_WIDTH / 2) / pxPerDay)
      return {
        ...s,
        start: addDays(due, -chipHalfDays),
        end: addDays(due, chipHalfDays),
      }
    }))
  }, [scheduled, timelineRange, pxPerDay])

  const chipLaneCount = Math.max(1, packedChips.length > 0 ? Math.max(...packedChips.map(c => c.lane)) + 1 : 1)
  const subRowHeight = chipLaneCount * ROW_HEIGHT_SUB

  // Total timeline height for rows
  const totalHeight = ROW_HEIGHT_PROJECT + phaseRowHeight + subRowHeight + 32 // 32 = header

  // Date ruler ticks
  const rulerTicks = useMemo(() => {
    if (!timelineRange) return []
    const ticks: { date: Date; x: number; label: string }[] = []
    const { start, totalDays } = timelineRange
    let step = 1
    let labelFn = (d: Date) => format(d, 'd')
    if (zoom === 'weeks') { step = 7; labelFn = (d: Date) => format(d, 'MMM d') }
    if (zoom === 'months') { step = 30; labelFn = (d: Date) => format(d, 'MMM yyyy') }
    for (let i = 0; i <= totalDays; i += step) {
      const date = addDays(start, i)
      ticks.push({ date, x: i * pxPerDay, label: labelFn(date) })
    }
    return ticks
  }, [timelineRange, zoom, pxPerDay])

  // Jump to today
  const jumpToToday = useCallback(() => {
    if (todayX === null || !scrollRef.current) return
    const viewWidth = scrollRef.current.clientWidth
    scrollRef.current.scrollLeft = todayX - viewWidth / 2
  }, [todayX])

  // Auto-scroll to today when zoom changes or data loads
  useEffect(() => {
    if (todayX !== null) {
      setTimeout(jumpToToday, 50)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, todayX !== null])

  // DnD sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const deltaX = event.delta.x
    const deltaDays = Math.round(deltaX / pxPerDay)
    setDragDeltaDays(deltaDays)
    setActiveDragId(String(event.active.id))
  }, [pxPerDay])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDragDeltaDays(0)
    setActiveDragId(null)
    const { active, delta } = event
    const id = String(active.id)
    const data = active.data.current
    if (!data) return

    const deltaDays = Math.round(delta.x / pxPerDay)
    if (deltaDays === 0) return

    if (data.type === 'phase') {
      const phase = data.phase as DBTimelinePhase
      const start = safeParseISO(phase.start_date)
      const end = safeParseISO(phase.end_date)
      if (!start || !end) return
      const newStart = addDays(start, deltaDays)
      const newEnd = addDays(end, deltaDays)
      updatePhase.mutate({ id: phase.id, start_date: dateToStr(newStart), end_date: dateToStr(newEnd) })
    } else if (data.type === 'sub') {
      const sub = data.sub as DBSubProject
      if (!sub.due_date) return
      const due = safeParseISO(sub.due_date)
      if (!due) return
      const newDue = addDays(due, deltaDays)
      updateSubDueDate.mutate({ id: sub.id, due_date: dateToStr(newDue) })
    }

    void id
  }, [pxPerDay, updatePhase, updateSubDueDate])

  // Phase resize callback
  const handlePhaseResizeDragEnd = useCallback((phaseId: string, newEndDate: string) => {
    updatePhase.mutate({ id: phaseId, end_date: newEndDate })
  }, [updatePhase])

  // SubProjectPanel state
  const [panelSubId, setPanelSubId] = useState<string | null>(null)
  const panelSub = useMemo(
    () => boardData?.subProjects.find(sp => sp.id === panelSubId) ?? null,
    [boardData, panelSubId]
  )

  // Dismiss context menus on escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setContextMenu(null); setSubContextMenu(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>Loading timeline…</p>
      </div>
    )
  }

  if (!proj?.start_date || !proj?.end_date) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar strip */}
        <TimelineToolbar
          zoom={zoom}
          onZoomChange={setZoom}
          onAddPhase={() => setShowAddPhase(true)}
          onJumpToToday={jumpToToday}
          hasDates={false}
        />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            Set project start and end dates to enable the timeline.
          </p>
          <button
            onClick={() => setShowSetDates(true)}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 'var(--text-sm)', padding: '8px 16px', cursor: 'pointer' }}
          >
            Set project dates →
          </button>
        </div>
        {showSetDates && (
          <SetProjectDatesPopover
            onClose={() => setShowSetDates(false)}
            onSave={(start, end) => {
              updateProjectDates.mutate({ start_date: start, end_date: end })
              setShowSetDates(false)
            }}
          />
        )}
      </div>
    )
  }

  if (!timelineRange) return null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* Toolbar */}
      <TimelineToolbar
        zoom={zoom}
        onZoomChange={setZoom}
        onAddPhase={() => setShowAddPhase(true)}
        onJumpToToday={jumpToToday}
        hasDates={true}
      />

      {/* Main scrollable area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Lane labels — sticky left column */}
        <div style={{
          width: LABEL_WIDTH,
          flexShrink: 0,
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10,
          overflowY: 'hidden',
        }}>
          {/* Header spacer */}
          <div style={{ height: 32, borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }} />
          {/* Project row label */}
          <div style={{ height: ROW_HEIGHT_PROJECT, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', fontWeight: 500 }}>PROJECT</span>
          </div>
          {/* Phases row label */}
          <div style={{ height: phaseRowHeight, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', fontWeight: 500 }}>PHASES</span>
          </div>
          {/* Sub-projects row label */}
          <div style={{ height: subRowHeight, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', fontWeight: 500 }}>SUB-PROJECTS</span>
          </div>
        </div>

        {/* Scrollable timeline canvas */}
        <div
          ref={scrollRef}
          className="timeline-scroll"
          style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}
        >
          <DndContext
            sensors={sensors}
            modifiers={[restrictToHorizontalAxis]}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          >
            <div style={{ width: containerWidth, minHeight: totalHeight, position: 'relative' }}>

              {/* Date ruler */}
              <div style={{ height: 32, position: 'sticky', top: 0, zIndex: 8, background: 'var(--bg-base)', borderBottom: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                {rulerTicks.map((tick, i) => (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: tick.x,
                      top: 0,
                      bottom: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div style={{ width: 1, height: 6, background: 'var(--border-subtle)' }} />
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', paddingLeft: 3, whiteSpace: 'nowrap' }}>{tick.label}</span>
                  </div>
                ))}
              </div>

              {/* Today line */}
              {todayX !== null && todayX >= 0 && todayX <= containerWidth && (
                <div style={{
                  position: 'absolute',
                  left: todayX,
                  top: 32,
                  bottom: 0,
                  width: 1.5,
                  background: 'var(--accent)',
                  opacity: 0.8,
                  zIndex: 6,
                  pointerEvents: 'none',
                }}>
                  <span style={{
                    position: 'absolute',
                    top: 0,
                    left: 3,
                    color: 'var(--accent)',
                    fontSize: 'var(--text-xs)',
                    whiteSpace: 'nowrap',
                    fontWeight: 500,
                  }}>
                    Today
                  </span>
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
                    <div style={{
                      position: 'absolute',
                      left,
                      top: 8,
                      width: right - left,
                      height: ROW_HEIGHT_PROJECT - 16,
                      background: `${proj.color}33`,
                      border: `1px solid ${proj.color}`,
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: 10,
                      overflow: 'hidden',
                    }}>
                      <span style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {proj.name}
                      </span>
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
                      onResizeDragEnd={handlePhaseResizeDragEnd}
                      onContextMenu={(e, ph) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, phase: ph }) }}
                    />
                  )
                })}
              </div>

              {/* Sub-projects swimlane */}
              <div style={{ height: subRowHeight, position: 'relative', borderBottom: '1px solid var(--border-subtle)' }}>
                {packedChips.map(chip => {
                  const due = safeParseISO(chip.due_date!)
                  if (!due) return null
                  const centerX = dateToX(due)
                  const top = chip.lane * ROW_HEIGHT_SUB + (ROW_HEIGHT_SUB - CHIP_HEIGHT) / 2
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

      {/* Unscheduled sub-projects */}
      {unscheduled.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)', maxHeight: 180, overflowY: 'auto', flexShrink: 0 }}>
          <button
            onClick={() => setUnscheduledOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 500 }}
          >
            <span style={{ transform: unscheduledOpen ? 'rotate(90deg)' : 'none', transition: 'transform 150ms ease', display: 'inline-block' }}>›</span>
            Unscheduled ({unscheduled.length})
          </button>
          {unscheduledOpen && (
            <div style={{ padding: '0 16px 8px' }}>
              {unscheduled.map(sub => (
                <UnscheduledRow
                  key={sub.id}
                  sub={sub}
                  onSetDate={date => updateSubDueDate.mutate({ id: sub.id, due_date: date })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Phase context menu */}
      {contextMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 29 }} onClick={() => setContextMenu(null)} />
          <div style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            padding: '4px 0',
            zIndex: 30,
            minWidth: 140,
          }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => { setEditPhase(contextMenu.phase); setContextMenu(null) }}
              style={ctxMenuItemStyle}
            >
              Edit
            </button>
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
            <button
              onClick={() => { deletePhase.mutate(contextMenu.phase.id); setContextMenu(null) }}
              style={{ ...ctxMenuItemStyle, color: 'var(--danger)' }}
            >
              Delete
            </button>
          </div>
        </>
      )}

      {/* Sub-project context menu */}
      {subContextMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 29 }} onClick={() => setSubContextMenu(null)} />
          <div style={{
            position: 'fixed',
            top: subContextMenu.y,
            left: subContextMenu.x,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            padding: '4px 0',
            zIndex: 30,
            minWidth: 140,
          }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => { setPanelSubId(subContextMenu.sub.id); onSubProjectClick(subContextMenu.sub.id); setSubContextMenu(null) }}
              style={ctxMenuItemStyle}
            >
              Open details
            </button>
            <button
              onClick={() => { updateSubDueDate.mutate({ id: subContextMenu.sub.id, due_date: null }); setSubContextMenu(null) }}
              style={ctxMenuItemStyle}
            >
              Remove due date
            </button>
          </div>
        </>
      )}

      {/* Add phase modal */}
      {showAddPhase && (
        <AddPhasePopover
          projectStart={safeParseISO(proj.start_date) ?? new Date()}
          onClose={() => setShowAddPhase(false)}
          onSubmit={(name, color, start_date, end_date) => {
            createPhase.mutate({ name, color, start_date, end_date, sort_order: (tlData?.phases.length ?? 0) })
            setShowAddPhase(false)
          }}
        />
      )}

      {/* Edit phase modal */}
      {editPhase && (
        <EditPhasePopover
          phase={editPhase}
          onClose={() => setEditPhase(null)}
          onSubmit={updates => {
            updatePhase.mutate({ id: editPhase.id, ...updates })
            setEditPhase(null)
          }}
        />
      )}

      {/* Set project dates */}
      {showSetDates && (
        <SetProjectDatesPopover
          onClose={() => setShowSetDates(false)}
          onSave={(start, end) => {
            updateProjectDates.mutate({ start_date: start, end_date: end })
            setShowSetDates(false)
          }}
        />
      )}

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

// ── Toolbar ───────────────────────────────────────────────────────────────────

interface TimelineToolbarProps {
  zoom: ZoomLevel
  onZoomChange: (z: ZoomLevel) => void
  onAddPhase: () => void
  onJumpToToday: () => void
  hasDates: boolean
}

function TimelineToolbar({ zoom, onZoomChange, onAddPhase, onJumpToToday, hasDates }: TimelineToolbarProps) {
  return (
    <div style={{
      height: 40,
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 10,
      flexShrink: 0,
    }}>
      {/* Zoom switcher */}
      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
        {(['days', 'weeks', 'months'] as ZoomLevel[]).map(z => (
          <button
            key={z}
            onClick={() => onZoomChange(z)}
            style={{
              background: zoom === z ? 'var(--bg-active)' : 'none',
              border: 'none',
              borderRight: z !== 'months' ? '1px solid var(--border-subtle)' : 'none',
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

      <div style={{ flex: 1 }} />

      {hasDates && (
        <>
          <button
            onClick={onAddPhase}
            style={{
              background: 'none',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              fontSize: 'var(--text-xs)',
              padding: '4px 10px',
              cursor: 'pointer',
            }}
          >
            + Phase
          </button>
          <button
            onClick={onJumpToToday}
            style={{
              background: 'none',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              fontSize: 'var(--text-xs)',
              padding: '4px 10px',
              cursor: 'pointer',
            }}
          >
            Jump to today
          </button>
        </>
      )}
    </div>
  )
}

// ── Unscheduled row ───────────────────────────────────────────────────────────

function UnscheduledRow({ sub, onSetDate }: { sub: SubWithCounts; onSetDate: (date: string) => void }) {
  const [showPicker, setShowPicker] = useState(false)
  const [dateVal, setDateVal] = useState(dateToStr(new Date()))

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_BORDER[sub.status] ?? 'var(--border-default)', flexShrink: 0 }} />
      <span style={{ flex: 1, color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>{sub.name}</span>
      {showPicker ? (
        <>
          <input
            type="date"
            value={dateVal}
            onChange={e => setDateVal(e.target.value)}
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 'var(--text-xs)', padding: '2px 6px', outline: 'none' }}
          />
          <button
            onClick={() => { onSetDate(dateVal); setShowPicker(false) }}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'white', fontSize: 'var(--text-xs)', padding: '2px 8px', cursor: 'pointer' }}
          >
            Set
          </button>
          <button
            onClick={() => setShowPicker(false)}
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', cursor: 'pointer', padding: '2px' }}
          >
            ×
          </button>
        </>
      ) : (
        <button
          onClick={() => setShowPicker(true)}
          style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', padding: '2px 8px', cursor: 'pointer' }}
        >
          + Set date
        </button>
      )}
    </div>
  )
}

// ── Context menu item style ───────────────────────────────────────────────────

const ctxMenuItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-xs)',
  padding: '6px 12px',
  cursor: 'pointer',
}
