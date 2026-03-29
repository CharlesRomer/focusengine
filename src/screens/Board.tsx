import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
  type OnNodeDrag,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useProjects, useCreateProject, useUpdateProject, useUpdateProjectViewport } from '@/hooks/useProjects'
import { useBoardData } from '@/hooks/useBoardData'
import { useBoardRealtime } from '@/hooks/useBoardRealtime'
import {
  useCreateDepartment,
  useDeleteDepartment,
  useRenameDepartment,
  useUpdateDepartmentPosition,
  useCreateSubProject,
  useUpdateSubProject,
  useUpdateSubProjectPosition,
  useDeleteSubProject,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useCreateEdge,
  useDeleteEdge,
  useCreateBlocker,
  useUpdateBlocker,
  useUpdateBlockerPosition,
  useDeleteBlocker,
} from '@/hooks/useBoardMutations'

import { ProjectTitleNode, type ProjectTitleNodeData } from '@/components/board/ProjectTitleNode'
import { DepartmentNode, type DepartmentNodeData } from '@/components/board/DepartmentNode'
import { SubProjectNode, type SubProjectNodeData } from '@/components/board/SubProjectNode'
import { BlockerNode, type BlockerNodeData } from '@/components/board/BlockerNode'
import { DeleteableEdge, type DeleteableEdgeData } from '@/components/board/DeleteableEdge'
import { SubProjectPanel } from '@/components/board/SubProjectPanel'

import type { DBProject, DBBoardEdge, SubProjectWithTasks, BoardMember } from '@/lib/board'
import { toast } from '@/store/ui'
import { Skeleton } from '@/components/shared/Skeleton'

// ── Node type registry ────────────────────────────────────────────────────────

const nodeTypes: NodeTypes = {
  'project-title': ProjectTitleNode,
  'department': DepartmentNode,
  'sub-project': SubProjectNode,
  'blocker': BlockerNode,
}

const edgeTypes: EdgeTypes = {
  'deleteable': DeleteableEdge,
}

// ── Context menu ──────────────────────────────────────────────────────────────

interface ContextMenu {
  x: number
  y: number
  canvasX: number
  canvasY: number
  type: 'canvas' | 'node'
  nodeId?: string
  nodeType?: string
}

// ── New project modal ─────────────────────────────────────────────────────────

function NewProjectModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, color: string) => void }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#7C6FE0')
  const colors = ['#7C6FE0', '#5A9FE0', '#3DB87A', '#E0A052', '#D95C5C', '#C06FE0']

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: 24, width: 360, boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ color: 'var(--text-primary)', fontSize: 'var(--text-base)', fontWeight: 500, marginBottom: 16 }}>New project</h3>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', marginBottom: 5 }}>Name</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onCreate(name, color) }}
            placeholder="Project name…"
            style={{
              width: '100%',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-sm)',
              padding: '8px 10px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', marginBottom: 8 }}>Color</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {colors.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: c,
                  border: color === c ? '2px solid white' : '2px solid transparent',
                  cursor: 'pointer',
                  outline: color === c ? `2px solid ${c}` : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { if (name.trim()) onCreate(name.trim(), color) }}
            disabled={!name.trim()}
            style={{
              flex: 1,
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'white',
              fontSize: 'var(--text-sm)',
              padding: '8px',
              cursor: name.trim() ? 'pointer' : 'not-allowed',
              opacity: name.trim() ? 1 : 0.5,
            }}
          >
            Create
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
              fontSize: 'var(--text-sm)',
              padding: '8px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── New department / add-name modal ───────────────────────────────────────────

function NameModal({ title, placeholder, onClose, onSubmit }: { title: string; placeholder: string; onClose: () => void; onSubmit: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: 20, width: 320, boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 10 }}>{title}</p>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSubmit(name.trim()); if (e.key === 'Escape') onClose() }}
          placeholder={placeholder}
          style={{
            width: '100%',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-sm)',
            padding: '8px 10px',
            outline: 'none',
            boxSizing: 'border-box',
            marginBottom: 12,
          }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { if (name.trim()) onSubmit(name.trim()) }}
            disabled={!name.trim()}
            style={{ flex: 1, background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 'var(--text-sm)', padding: '7px', cursor: 'pointer', opacity: name.trim() ? 1 : 0.5 }}
          >
            Add
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

// ── Confirm delete modal ──────────────────────────────────────────────────────

function ConfirmModal({ message, onConfirm, onClose }: { message: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: 24, width: 340, boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 20, lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onConfirm}
            style={{ flex: 1, background: 'var(--danger)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 'var(--text-sm)', padding: '8px', cursor: 'pointer' }}
          >
            Delete
          </button>
          <button
            onClick={onClose}
            style={{ flex: 1, background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', padding: '8px', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Rename modal ──────────────────────────────────────────────────────────────

function RenameModal({ initialValue, title, onClose, onSubmit }: { initialValue: string; title: string; onClose: () => void; onSubmit: (name: string) => void }) {
  const [value, setValue] = useState(initialValue)
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: 20, width: 320, boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 10 }}>{title}</p>
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && value.trim()) onSubmit(value.trim()); if (e.key === 'Escape') onClose() }}
          style={{
            width: '100%',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-sm)',
            padding: '8px 10px',
            outline: 'none',
            boxSizing: 'border-box',
            marginBottom: 12,
          }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { if (value.trim()) onSubmit(value.trim()) }}
            disabled={!value.trim()}
            style={{ flex: 1, background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 'var(--text-sm)', padding: '7px', cursor: 'pointer', opacity: value.trim() ? 1 : 0.5 }}
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

// ── Canvas helpers ────────────────────────────────────────────────────────────

// Build React Flow nodes from board data
function buildNodes(
  project: DBProject,
  data: ReturnType<typeof useBoardData>['data'],
  callbacks: {
    onTaskToggle: (subId: string, taskId: string, val: boolean, proof_url?: string) => void
    onTaskAdd: (subId: string, title: string) => void
    onTaskDelete: (taskId: string) => void
    onNodeClick: (subId: string) => void
    onBlockerResolve: (blockerId: string) => void
    onBlockerUnresolve: (blockerId: string) => void
    onBlockerNoteChange: (blockerId: string, note: string) => void
  }
): Node[] {
  if (!data) return []

  const { departments, subProjects, blockers } = data

  // Compute project-level progress
  const allTasks = subProjects.flatMap(sp => sp.tasks)
  const totalTasks = allTasks.length
  const completedTasks = allTasks.filter(t => t.is_complete).length

  const nodes: Node[] = []

  // Project title node (fixed at top)
  nodes.push({
    id: `project-title-${project.id}`,
    type: 'project-title',
    position: { x: 0, y: 0 },
    data: {
      name: project.name,
      description: project.description,
      color: project.color,
      totalTasks,
      completedTasks,
    } as ProjectTitleNodeData,
    draggable: false,
    selectable: false,
  })

  // Department nodes
  for (const dept of departments) {
    const deptSubs = subProjects.filter(sp => sp.department_id === dept.id)
    const deptTasks = deptSubs.flatMap(sp => sp.tasks)
    nodes.push({
      id: dept.id,
      type: 'department',
      position: { x: dept.position_x, y: dept.position_y },
      data: {
        name: dept.name,
        taskCount: deptTasks.length,
        completedTaskCount: deptTasks.filter(t => t.is_complete).length,
      } as DepartmentNodeData,
    })
  }

  // Sub-project nodes
  for (const sp of subProjects) {
    nodes.push({
      id: sp.id,
      type: 'sub-project',
      position: { x: sp.position_x, y: sp.position_y },
      data: {
        name: sp.name,
        description: sp.description,
        status: sp.status,
        owner: sp.owner,
        due_date: sp.due_date,
        tasks: sp.tasks,
        members: data.members,
        onTaskToggle: (taskId: string, val: boolean, proof_url?: string) => callbacks.onTaskToggle(sp.id, taskId, val, proof_url),
        onTaskAdd: (title: string) => callbacks.onTaskAdd(sp.id, title),
        onTaskDelete: callbacks.onTaskDelete,
        onNodeClick: () => callbacks.onNodeClick(sp.id),
      } as SubProjectNodeData,
    })
  }

  // Blocker nodes
  for (const blocker of blockers) {
    nodes.push({
      id: blocker.id,
      type: 'blocker',
      position: { x: blocker.position_x, y: blocker.position_y },
      data: {
        title: blocker.title,
        note: blocker.note,
        is_resolved: blocker.is_resolved,
        resolved_at: blocker.resolved_at,
        onResolve: () => callbacks.onBlockerResolve(blocker.id),
        onUnresolve: () => callbacks.onBlockerUnresolve(blocker.id),
        onNoteChange: (note: string) => callbacks.onBlockerNoteChange(blocker.id, note),
      } as BlockerNodeData,
    })
  }

  return nodes
}

// Build React Flow edges from DB edges
function buildEdges(dbEdges: DBBoardEdge[] | undefined, onDelete: (id: string) => void): Edge[] {
  if (!dbEdges) return []
  return dbEdges.map(e => ({
    id: e.id,
    source: e.source_id,
    target: e.target_id,
    type: 'deleteable',
    data: { onDelete } as DeleteableEdgeData,
    style: {
      stroke: e.target_type === 'blocker' ? 'var(--danger)' : 'var(--accent)',
      strokeWidth: 1.5,
      strokeDasharray: e.target_type === 'blocker' ? '4 4' : undefined,
    },
    markerEnd: e.target_type !== 'blocker' ? {
      type: 'arrowclosed' as const,
      color: 'var(--accent)',
      width: 10,
      height: 10,
    } : undefined,
  }))
}

// ── Main Board screen ─────────────────────────────────────────────────────────

export function BoardScreen() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [showNewProject, setShowNewProject] = useState(false)
  const [showNameModal, setShowNameModal] = useState<'department' | 'sub-project' | 'blocker' | null>(null)
  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [selectedSubProjectId, setSelectedSubProjectId] = useState<string | null>(null)
  const [confirmDeleteDept, setConfirmDeleteDept] = useState<{ id: string; name: string } | null>(null)
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; type: 'department' | 'blocker' } | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const reactFlowRef = useRef<HTMLDivElement>(null)
  const viewportSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Data hooks
  const { data: projects, isLoading: projectsLoading } = useProjects()
  const { data: boardData, isLoading: boardLoading } = useBoardData(selectedProjectId)
  useBoardRealtime(selectedProjectId)

  // Mutations
  const createProject = useCreateProject()
  const updateProject = useUpdateProject()
  const updateViewport = useUpdateProjectViewport()

  const createDept = useCreateDepartment(selectedProjectId ?? '')
  const deleteDept = useDeleteDepartment(selectedProjectId ?? '')
  const renameDept = useRenameDepartment(selectedProjectId ?? '')
  const updateDeptPos = useUpdateDepartmentPosition(selectedProjectId ?? '')
  const createSub = useCreateSubProject(selectedProjectId ?? '')
  const updateSub = useUpdateSubProject(selectedProjectId ?? '')
  const updateSubPos = useUpdateSubProjectPosition(selectedProjectId ?? '')
  const deleteSub = useDeleteSubProject(selectedProjectId ?? '')
  const createTask = useCreateTask(selectedProjectId ?? '')
  const updateTask = useUpdateTask(selectedProjectId ?? '')
  const deleteTask = useDeleteTask(selectedProjectId ?? '')
  const createEdge = useCreateEdge(selectedProjectId ?? '')
  const deleteEdge = useDeleteEdge(selectedProjectId ?? '')
  const createBlocker = useCreateBlocker(selectedProjectId ?? '')
  const updateBlocker = useUpdateBlocker(selectedProjectId ?? '')
  const updateBlockerPos = useUpdateBlockerPosition(selectedProjectId ?? '')
  const deleteBlocker = useDeleteBlocker(selectedProjectId ?? '')

  // Derived data
  const selectedProject = useMemo(
    () => projects?.find(p => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  )

  const selectedSubProject = useMemo(
    () => boardData?.subProjects.find(sp => sp.id === selectedSubProjectId) ?? null,
    [boardData, selectedSubProjectId]
  )

  // Callbacks for node interactions
  const handleTaskToggle = useCallback((subId: string, taskId: string, val: boolean, proof_url?: string) => {
    updateTask.mutate({ id: taskId, is_complete: val, ...(proof_url ? { proof_url } : {}) })
  }, [updateTask])

  const handleTaskAdd = useCallback((subId: string, title: string) => {
    const existing = boardData?.subProjects.find(sp => sp.id === subId)?.tasks ?? []
    createTask.mutate({ sub_project_id: subId, title, sort_order: existing.length })
  }, [createTask, boardData])

  const handleTaskDelete = useCallback((taskId: string) => {
    deleteTask.mutate(taskId)
  }, [deleteTask])

  const handleBlockerResolve = useCallback((blockerId: string) => {
    updateBlocker.mutate({ id: blockerId, is_resolved: true, resolved_at: new Date().toISOString() })
  }, [updateBlocker])

  const handleBlockerUnresolve = useCallback((blockerId: string) => {
    updateBlocker.mutate({ id: blockerId, is_resolved: false, resolved_at: null })
  }, [updateBlocker])

  const handleBlockerNoteChange = useCallback((blockerId: string, note: string) => {
    updateBlocker.mutate({ id: blockerId, note: note || null })
  }, [updateBlocker])

  const handleNodeClick = useCallback((subId: string) => {
    setSelectedSubProjectId(subId)
  }, [])

  // Handle edge deletion from the floating X button on the custom edge
  const handleEdgeDelete = useCallback((edgeId: string) => {
    deleteEdge.mutate(edgeId)
    setEdges(eds => eds.filter(e => e.id !== edgeId))
  }, [deleteEdge, setEdges])

  // Sync board data → React Flow nodes/edges
  useEffect(() => {
    if (!selectedProject || !boardData) {
      setNodes([])
      setEdges([])
      return
    }

    const newNodes = buildNodes(selectedProject, boardData, {
      onTaskToggle: handleTaskToggle,
      onTaskAdd: handleTaskAdd,
      onTaskDelete: handleTaskDelete,
      onNodeClick: handleNodeClick,
      onBlockerResolve: handleBlockerResolve,
      onBlockerUnresolve: handleBlockerUnresolve,
      onBlockerNoteChange: handleBlockerNoteChange,
    })

    const newEdges = buildEdges(boardData.edges, handleEdgeDelete)

    setNodes(newNodes)
    setEdges(newEdges)
  // Intentionally not including callback functions in deps — they're stable via useCallback
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardData, selectedProject])

  // Handle new edge connection
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return

    // Determine source type
    const sourceNode = nodes.find(n => n.id === connection.source)
    const targetNode = nodes.find(n => n.id === connection.target)
    if (!sourceNode || !targetNode) return

    const sourceType = sourceNode.type === 'department' ? 'department' : sourceNode.type === 'sub-project' ? 'sub_project' : 'project'
    const targetType = targetNode.type === 'department' ? 'department' : targetNode.type === 'sub-project' ? 'sub_project' : 'blocker'

    createEdge.mutate({
      source_id: connection.source,
      source_type: sourceType as 'project' | 'department' | 'sub_project',
      target_id: connection.target,
      target_type: targetType as 'department' | 'sub_project' | 'blocker',
    })

    setEdges(eds => addEdge(connection, eds))
  }, [nodes, createEdge, setEdges])

  // Handle edge deletion (keyboard Delete/Backspace on selected edge)
  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    for (const edge of deleted) {
      deleteEdge.mutate(edge.id)
    }
  }, [deleteEdge])

  // Handle node drag stop — write positions to DB (debounced)
  const onNodeDragStop: OnNodeDrag = useCallback((_event, node) => {
    const pos = node.position
    if (node.type === 'department') {
      updateDeptPos.mutate({ id: node.id, position_x: pos.x, position_y: pos.y })
    } else if (node.type === 'sub-project') {
      updateSubPos.mutate({ id: node.id, position_x: pos.x, position_y: pos.y })
    } else if (node.type === 'blocker') {
      updateBlockerPos.mutate({ id: node.id, position_x: pos.x, position_y: pos.y })
    }
  }, [updateDeptPos, updateSubPos, updateBlockerPos])

  // Handle viewport change — debounced save
  const onMoveEnd = useCallback((_event: MouseEvent | TouchEvent | null, viewport: { x: number; y: number; zoom: number }) => {
    if (!selectedProjectId) return
    if (viewportSaveTimer.current) clearTimeout(viewportSaveTimer.current)
    viewportSaveTimer.current = setTimeout(() => {
      updateViewport.mutate({ id: selectedProjectId, viewport })
    }, 500)
  }, [selectedProjectId, updateViewport])

  // Right-click context menu
  const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault()
    const bounds = reactFlowRef.current?.getBoundingClientRect()
    const canvasX = bounds ? event.clientX - bounds.left : event.clientX
    const canvasY = bounds ? event.clientY - bounds.top : event.clientY
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      canvasX,
      canvasY,
      type: 'canvas',
    })
  }, [])

  const onNodeContextMenu = useCallback((event: MouseEvent | React.MouseEvent, node: Node) => {
    event.preventDefault()
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      canvasX: node.position.x,
      canvasY: node.position.y,
      type: 'node',
      nodeId: node.id,
      nodeType: node.type,
    })
  }, [])

  const dismissContextMenu = useCallback(() => setContextMenu(null), [])

  // Close context menu on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setContextMenu(null)
        setSelectedSubProjectId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Project creation ──────────────────────────────────────────────────────
  const handleCreateProject = async (name: string, color: string) => {
    try {
      const id = await createProject.mutateAsync({ name, color })
      setSelectedProjectId(id)
      setShowNewProject(false)
    } catch { /* already toasted */ }
  }

  // ── Add Department ────────────────────────────────────────────────────────
  const handleAddDepartment = async (name: string) => {
    if (!selectedProjectId) return
    const pos = pendingPosition ?? { x: 200, y: 200 }
    await createDept.mutateAsync({ name, position_x: pos.x, position_y: pos.y })
    setShowNameModal(null)
    setPendingPosition(null)
  }

  // ── Add Sub-project ───────────────────────────────────────────────────────
  const handleAddSubProject = async (name: string) => {
    if (!selectedProjectId) return
    const pos = pendingPosition ?? { x: 200, y: 400 }
    await createSub.mutateAsync({ name, position_x: pos.x, position_y: pos.y })
    setShowNameModal(null)
    setPendingPosition(null)
  }

  // ── Add Blocker ───────────────────────────────────────────────────────────
  const handleAddBlocker = async (title: string) => {
    if (!selectedProjectId) return
    const pos = pendingPosition ?? { x: 400, y: 400 }
    await createBlocker.mutateAsync({ title, position_x: pos.x, position_y: pos.y })
    setShowNameModal(null)
    setPendingPosition(null)
  }

  // ── Context menu actions ──────────────────────────────────────────────────
  const handleContextMenuAction = (action: string) => {
    if (!contextMenu) return
    const pos = { x: contextMenu.canvasX, y: contextMenu.canvasY }

    switch (action) {
      case 'add-sub-project':
        setPendingPosition(pos)
        setShowNameModal('sub-project')
        break
      case 'add-blocker':
        setPendingPosition(pos)
        setShowNameModal('blocker')
        break
      case 'edit-node':
        if (contextMenu.nodeType === 'sub-project') {
          setSelectedSubProjectId(contextMenu.nodeId ?? null)
        } else if (contextMenu.nodeType === 'department' && contextMenu.nodeId) {
          const dept = boardData?.departments.find(d => d.id === contextMenu.nodeId)
          if (dept) setRenameTarget({ id: dept.id, name: dept.name, type: 'department' })
        } else if (contextMenu.nodeType === 'blocker' && contextMenu.nodeId) {
          const blocker = boardData?.blockers.find(b => b.id === contextMenu.nodeId)
          if (blocker) setRenameTarget({ id: blocker.id, name: blocker.title, type: 'blocker' })
        }
        break
      case 'delete-node':
        if (contextMenu.nodeId) {
          if (contextMenu.nodeType === 'sub-project') {
            deleteSub.mutate(contextMenu.nodeId)
          } else if (contextMenu.nodeType === 'blocker') {
            deleteBlocker.mutate(contextMenu.nodeId)
          } else if (contextMenu.nodeType === 'department') {
            const dept = boardData?.departments.find(d => d.id === contextMenu.nodeId)
            if (dept) setConfirmDeleteDept({ id: dept.id, name: dept.name })
          }
        }
        break
      case 'add-task':
        if (contextMenu.nodeId) {
          setSelectedSubProjectId(contextMenu.nodeId)
        }
        break
    }
    setContextMenu(null)
  }

  // ── Keyboard Delete on selected nodes ─────────────────────────────────────
  const onNodesDelete = useCallback((deleted: Node[]) => {
    for (const node of deleted) {
      if (node.type === 'sub-project') {
        deleteSub.mutate(node.id)
      } else if (node.type === 'blocker') {
        deleteBlocker.mutate(node.id)
      } else if (node.type === 'department') {
        const dept = boardData?.departments.find(d => d.id === node.id)
        if (dept) setConfirmDeleteDept({ id: dept.id, name: dept.name })
      }
    }
  }, [deleteSub, deleteBlocker, boardData])

  // ── Sub-project panel actions ─────────────────────────────────────────────
  const handleSubProjectUpdate = useCallback((updates: {
    name?: string
    description?: string | null
    owner_id?: string | null
    due_date?: string | null
    status?: 'not_started' | 'in_progress' | 'blocked' | 'complete'
  }) => {
    if (!selectedSubProjectId) return
    updateSub.mutate({ id: selectedSubProjectId, ...updates })
  }, [selectedSubProjectId, updateSub])

  const handleSubProjectDelete = useCallback(() => {
    if (!selectedSubProjectId) return
    deleteSub.mutate(selectedSubProjectId)
    setSelectedSubProjectId(null)
  }, [selectedSubProjectId, deleteSub])

  // ── Project list progress ─────────────────────────────────────────────────
  const getProjectProgress = useCallback((projectId: string) => {
    if (!boardData || projectId !== selectedProjectId) return null
    const all = boardData.subProjects.flatMap(sp => sp.tasks)
    if (all.length === 0) return null
    return Math.round((all.filter(t => t.is_complete).length / all.length) * 100)
  }, [boardData, selectedProjectId])

  // ── MiniMap node color ────────────────────────────────────────────────────
  const miniMapNodeColor = useCallback((node: Node) => {
    switch (node.type) {
      case 'project-title': return selectedProject?.color ?? 'var(--accent)'
      case 'department': return '#5A9FE0'
      case 'sub-project': return 'var(--accent)'
      case 'blocker': return 'var(--danger)'
      default: return 'var(--border-default)'
    }
  }, [selectedProject])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-base)', overflow: 'hidden' }}>

      {/* Left panel */}
      <div
        style={{
          width: 260,
          flexShrink: 0,
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontWeight: 500, flex: 1 }}>Projects</span>
          <button
            onClick={() => setShowNewProject(true)}
            style={{
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: 'white',
              fontSize: 'var(--text-xs)',
              padding: '4px 10px',
              cursor: 'pointer',
            }}
          >
            + New
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {projectsLoading && (
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[100, 80, 90].map((w, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                  <Skeleton width={8} height={8} className="rounded-full" />
                  <Skeleton height={14} width={`${w}%`} />
                </div>
              ))}
            </div>
          )}
          {!projectsLoading && (!projects || projects.length === 0) && (
            <div style={{ padding: '20px 16px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', marginBottom: 12 }}>No projects yet</p>
              <button
                onClick={() => setShowNewProject(true)}
                style={{
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: 'white',
                  fontSize: 'var(--text-sm)',
                  padding: '8px 16px',
                  cursor: 'pointer',
                }}
              >
                Create your first project
              </button>
            </div>
          )}
          {projects?.map(project => {
            const progress = getProjectProgress(project.id)
            const isSelected = project.id === selectedProjectId
            return (
              <button
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: isSelected ? 'var(--bg-active)' : 'none',
                  border: 'none',
                  borderLeft: `3px solid ${isSelected ? project.color : 'transparent'}`,
                  padding: '10px 16px',
                  cursor: 'pointer',
                  transition: 'background 150ms ease',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: progress != null ? 5 : 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: project.color, flexShrink: 0 }} />
                  <span style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {project.name}
                  </span>
                </div>
                {progress != null && (
                  <div style={{ paddingLeft: 16 }}>
                    <div style={{ height: 2, background: 'var(--bg-hover)', borderRadius: 1, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progress}%`, background: project.color, borderRadius: 1 }} />
                    </div>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>{progress}%</span>
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Archive selected project */}
        {selectedProject && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-subtle)' }}>
            <button
              onClick={() => updateProject.mutate({ id: selectedProject.id, status: 'archived' })}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                color: 'var(--text-tertiary)',
                fontSize: 'var(--text-xs)',
                padding: '4px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Archive project
            </button>
          </div>
        )}
      </div>

      {/* Right canvas area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Toolbar */}
        {selectedProject && (
          <div
            style={{
              height: 48,
              background: 'var(--bg-surface)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 16px',
              gap: 10,
              flexShrink: 0,
            }}
          >
            <span style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontWeight: 500, flex: 1 }}>
              {selectedProject.name}
            </span>

            <button
              onClick={() => { setPendingPosition(null); setShowNameModal('department') }}
              style={toolbarButtonStyle}
            >
              + Category
            </button>
            <button
              onClick={() => { setPendingPosition(null); setShowNameModal('sub-project') }}
              style={toolbarButtonStyle}
            >
              + Sub-project
            </button>
            <button
              onClick={() => { setPendingPosition(null); setShowNameModal('blocker') }}
              style={{ ...toolbarButtonStyle, color: 'var(--danger)', borderColor: 'rgba(217,92,92,0.3)' }}
            >
              + Blocker
            </button>
          </div>
        )}

        {/* Canvas or empty state */}
        {!selectedProjectId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>Select a project or create one to get started.</p>
            <button
              onClick={() => setShowNewProject(true)}
              style={{ background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: 'white', fontSize: 'var(--text-sm)', padding: '8px 16px', cursor: 'pointer' }}
            >
              + New project
            </button>
          </div>
        ) : boardLoading ? (
          <div style={{ flex: 1, padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', gap: 20 }}>
              {[280, 280, 220].map((w, i) => (
                <Skeleton key={i} width={w} height={120} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 20, marginLeft: 60 }}>
              {[280, 280].map((w, i) => (
                <Skeleton key={i} width={w} height={160} />
              ))}
            </div>
          </div>
        ) : (
          <div ref={reactFlowRef} className="board-canvas" style={{ flex: 1, position: 'relative' }}>
            {/* Canvas empty state (shown when project has no nodes) */}
            {nodes.filter(n => n.type !== 'project-title').length === 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 10,
                  pointerEvents: 'none',
                  textAlign: 'center',
                }}
              >
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 4 }}>
                  Start by adding a category or sub-project →
                </p>
                <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
                  Use the toolbar above or right-click on the canvas
                </p>
              </div>
            )}

            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onEdgesDelete={onEdgesDelete}
              onNodesDelete={onNodesDelete}
              onNodeDragStop={onNodeDragStop}
              onMoveEnd={onMoveEnd}
              onPaneContextMenu={onPaneContextMenu}
              onNodeContextMenu={onNodeContextMenu}
              onPaneClick={dismissContextMenu}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultViewport={selectedProject?.canvas_viewport ?? { x: 50, y: 80, zoom: 1 }}
              fitViewOptions={{ padding: 0.1 }}
              deleteKeyCode={['Delete', 'Backspace']}
              style={{ background: 'var(--bg-base)' }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                color="rgba(255,255,255,0.04)"
                gap={24}
                size={1.5}
              />
              <Controls
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}
              />
              <MiniMap
                nodeColor={miniMapNodeColor}
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}
                maskColor="rgba(0,0,0,0.3)"
              />
            </ReactFlow>

            {/* Context menu */}
            {contextMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 29 }} onClick={dismissContextMenu} />
                <div
                  style={{
                    position: 'fixed',
                    top: contextMenu.y,
                    left: contextMenu.x,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-lg)',
                    padding: '4px 0',
                    zIndex: 30,
                    minWidth: 160,
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {contextMenu.type === 'canvas' ? (
                    <>
                      <ContextMenuItem label="Add Sub-project here" onClick={() => handleContextMenuAction('add-sub-project')} />
                      <ContextMenuItem label="Add Blocker here" onClick={() => handleContextMenuAction('add-blocker')} />
                    </>
                  ) : (
                    <>
                      {contextMenu.nodeType !== 'project-title' && (
                        <>
                          <ContextMenuItem label="Edit" onClick={() => handleContextMenuAction('edit-node')} />
                          {contextMenu.nodeType === 'sub-project' && (
                            <ContextMenuItem label="Add task" onClick={() => handleContextMenuAction('add-task')} />
                          )}
                          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
                          <ContextMenuItem label="Delete" onClick={() => handleContextMenuAction('delete-node')} danger />
                        </>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Sub-project detail panel */}
      {selectedSubProject && boardData && (
        <SubProjectPanel
          subProject={selectedSubProject}
          members={boardData.members}
          onClose={() => setSelectedSubProjectId(null)}
          onUpdate={handleSubProjectUpdate}
          onAddTask={title => {
            const existing = selectedSubProject.tasks.length
            createTask.mutate({ sub_project_id: selectedSubProject.id, title, sort_order: existing })
          }}
          onUpdateTask={(taskId, updates) => updateTask.mutate({ id: taskId, ...updates })}
          onDeleteTask={taskId => deleteTask.mutate(taskId)}
          onDelete={handleSubProjectDelete}
        />
      )}

      {/* Modals */}
      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreate={handleCreateProject}
        />
      )}

      {showNameModal === 'department' && (
        <NameModal
          title="Add category"
          placeholder="e.g. Marketing, Product, Design…"
          onClose={() => { setShowNameModal(null); setPendingPosition(null) }}
          onSubmit={handleAddDepartment}
        />
      )}

      {showNameModal === 'sub-project' && (
        <NameModal
          title="Add sub-project"
          placeholder="Sub-project name…"
          onClose={() => { setShowNameModal(null); setPendingPosition(null) }}
          onSubmit={handleAddSubProject}
        />
      )}

      {showNameModal === 'blocker' && (
        <NameModal
          title="Add blocker"
          placeholder="Describe the blocker…"
          onClose={() => { setShowNameModal(null); setPendingPosition(null) }}
          onSubmit={handleAddBlocker}
        />
      )}

      {/* Confirm delete category */}
      {confirmDeleteDept && (
        <ConfirmModal
          message={`Delete category "${confirmDeleteDept.name}"? This will also delete all sub-projects inside it.`}
          onClose={() => setConfirmDeleteDept(null)}
          onConfirm={() => {
            deleteDept.mutate(confirmDeleteDept.id)
            setConfirmDeleteDept(null)
          }}
        />
      )}

      {/* Rename category / blocker */}
      {renameTarget && (
        <RenameModal
          title={renameTarget.type === 'department' ? 'Rename category' : 'Rename blocker'}
          initialValue={renameTarget.name}
          onClose={() => setRenameTarget(null)}
          onSubmit={name => {
            if (renameTarget.type === 'department') {
              renameDept.mutate({ id: renameTarget.id, name })
            } else {
              updateBlocker.mutate({ id: renameTarget.id, title: name })
            }
            setRenameTarget(null)
          }}
        />
      )}
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────

const toolbarButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-xs)',
  padding: '4px 10px',
  cursor: 'pointer',
  transition: 'border-color 150ms ease, color 150ms ease',
}

function ContextMenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: 'none',
        border: 'none',
        color: danger ? 'var(--danger)' : 'var(--text-secondary)',
        fontSize: 'var(--text-sm)',
        padding: '7px 14px',
        cursor: 'pointer',
        transition: 'background 100ms ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      {label}
    </button>
  )
}
