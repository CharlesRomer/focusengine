import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { toast } from '@/store/ui'

// Fire-and-forget Notion sync — only attempted if user has notion_connected
async function syncToNotion(taskId: string, action: 'upsert' | 'delete') {
  try {
    await supabase.functions.invoke('notion-sync', { body: { taskId, action } })
  } catch {
    // Silently ignore Notion sync errors
  }
}

function invalidateBoard(qc: ReturnType<typeof useQueryClient>, projectId: string) {
  qc.invalidateQueries({ queryKey: ['board-data', projectId] })
}

function invalidateTimeline(qc: ReturnType<typeof useQueryClient>, projectId: string) {
  qc.invalidateQueries({ queryKey: ['timeline-data', projectId] })
}

function invalidateBoth(qc: ReturnType<typeof useQueryClient>, projectId: string) {
  invalidateBoard(qc, projectId)
  invalidateTimeline(qc, projectId)
}

// ── Departments ───────────────────────────────────────────────────────────────

export function useCreateDepartment(projectId: string) {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ name, position_x, position_y }: { name: string; position_x: number; position_y: number }) => {
      const id = crypto.randomUUID()
      const { error } = await supabase.from('board_departments').insert({
        id,
        project_id: projectId,
        team_org_id: user!.team_org_id!,
        name: name.trim(),
        position_x,
        position_y,
      })
      if (error) {
        console.error('[useCreateDepartment] error:', error)
        toast('Failed to create department', 'error')
        throw error
      }
      return id
    },
    onSuccess: () => invalidateBoard(qc, projectId),
  })
}

export function useDeleteDepartment(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // Delete child sub-projects first (FK is ON DELETE SET NULL, not CASCADE)
      const { error: subsErr } = await supabase.from('sub_projects').delete().eq('department_id', id)
      if (subsErr) {
        console.error('[useDeleteDepartment] sub-project delete error:', subsErr)
        toast('Failed to delete category', 'error')
        throw subsErr
      }
      const { error } = await supabase.from('board_departments').delete().eq('id', id)
      if (error) {
        console.error('[useDeleteDepartment] error:', error)
        toast('Failed to delete category', 'error')
        throw error
      }
    },
    onSuccess: () => invalidateBoard(qc, projectId),
  })
}

export function useRenameDepartment(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('board_departments').update({ name }).eq('id', id)
      if (error) {
        console.error('[useRenameDepartment] error:', error)
        toast('Failed to rename category', 'error')
        throw error
      }
    },
    onSuccess: () => invalidateBoard(qc, projectId),
  })
}

export function useUpdateDepartmentPosition(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, position_x, position_y }: { id: string; position_x: number; position_y: number }) => {
      const { error } = await supabase.from('board_departments').update({ position_x, position_y }).eq('id', id)
      if (error) {
        console.error('[useUpdateDepartmentPosition] error:', error)
        throw error
      }
    },
    onSuccess: () => invalidateBoard(qc, projectId),
  })
}

// ── Sub-projects ──────────────────────────────────────────────────────────────

export function useCreateSubProject(projectId: string) {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      name,
      department_id,
      position_x,
      position_y,
    }: {
      name: string
      department_id?: string | null
      position_x: number
      position_y: number
    }) => {
      const id = crypto.randomUUID()
      const { error } = await supabase.from('sub_projects').insert({
        id,
        project_id: projectId,
        team_org_id: user!.team_org_id!,
        name: name.trim(),
        department_id: department_id ?? null,
        position_x,
        position_y,
      })
      if (error) {
        console.error('[useCreateSubProject] error:', error)
        toast('Failed to create sub-project', 'error')
        throw error
      }
      return id
    },
    onSuccess: () => invalidateBoard(qc, projectId),
  })
}

export function useUpdateSubProject(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string
      name?: string
      description?: string | null
      owner_id?: string | null
      start_date?: string | null
      due_date?: string | null
      status?: 'not_started' | 'in_progress' | 'blocked' | 'complete'
    }) => {
      const { error } = await supabase.from('sub_projects').update(updates).eq('id', id)
      if (error) {
        console.error('[useUpdateSubProject] error:', error)
        toast('Failed to update sub-project', 'error')
        throw error
      }
    },
    onSuccess: () => invalidateBoard(qc, projectId),
  })
}

export function useUpdateSubProjectPosition(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, position_x, position_y }: { id: string; position_x: number; position_y: number }) => {
      const { error } = await supabase.from('sub_projects').update({ position_x, position_y }).eq('id', id)
      if (error) {
        console.error('[useUpdateSubProjectPosition] error:', error)
        throw error
      }
    },
    onSuccess: () => invalidateBoard(qc, projectId),
  })
}

export function useDeleteSubProject(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sub_projects').delete().eq('id', id)
      if (error) {
        console.error('[useDeleteSubProject] error:', error)
        toast('Failed to delete sub-project', 'error')
        throw error
      }
    },
    onSuccess: () => invalidateBoard(qc, projectId),
  })
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function useCreateTask(projectId: string) {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ sub_project_id, title, sort_order }: { sub_project_id: string; title: string; sort_order: number }) => {
      const id = crypto.randomUUID()
      const { error } = await supabase.from('sub_project_tasks').insert({
        id,
        sub_project_id,
        team_org_id: user!.team_org_id!,
        title: title.trim(),
        sort_order,
      })
      if (error) {
        console.error('[useCreateTask] error:', error)
        toast('Failed to add task', 'error')
        throw error
      }
      // Fire-and-forget Notion sync if user has it connected
      if ((user as { notion_connected?: boolean })?.notion_connected) {
        void syncToNotion(id, 'upsert')
      }
      return id
    },
    onSuccess: () => invalidateBoard(qc, projectId),
  })
}

export function useUpdateTask(projectId: string) {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; title?: string; owner_id?: string | null; is_complete?: boolean; proof_url?: string | null }) => {
      const { error } = await supabase.from('sub_project_tasks').update(updates).eq('id', id)
      if (error) {
        console.error('[useUpdateTask] error:', error)
        toast('Failed to update task', 'error')
        throw error
      }
      if ((user as { notion_connected?: boolean })?.notion_connected) {
        void syncToNotion(id, 'upsert')
      }
    },
    onSuccess: () => invalidateBoard(qc, projectId),
  })
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sub_project_tasks').delete().eq('id', id)
      if (error) {
        console.error('[useDeleteTask] error:', error)
        toast('Failed to delete task', 'error')
        throw error
      }
    },
    onSuccess: () => invalidateBoard(qc, projectId),
  })
}

export function useReorderTasks(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      for (const { id, sort_order } of updates) {
        const { error } = await supabase.from('sub_project_tasks').update({ sort_order }).eq('id', id)
        if (error) {
          console.error('[useReorderTasks] error:', error)
          toast('Failed to reorder tasks', 'error')
          throw error
        }
      }
    },
    onSuccess: () => invalidateBoard(qc, projectId),
  })
}

// ── Edges ─────────────────────────────────────────────────────────────────────

export function useCreateEdge(projectId: string) {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      source_id,
      source_type,
      target_id,
      target_type,
    }: {
      source_id: string
      source_type: 'project' | 'department' | 'sub_project'
      target_id: string
      target_type: 'department' | 'sub_project' | 'blocker'
    }) => {
      const id = crypto.randomUUID()
      const { error } = await supabase.from('board_edges').insert({
        id,
        project_id: projectId,
        team_org_id: user!.team_org_id!,
        source_id,
        source_type,
        target_id,
        target_type,
      })
      if (error) {
        console.error('[useCreateEdge] error:', error)
        toast('Failed to create connection', 'error')
        throw error
      }
      return id
    },
    onSuccess: () => invalidateBoard(qc, projectId),
  })
}

export function useDeleteEdge(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('board_edges').delete().eq('id', id)
      if (error) {
        console.error('[useDeleteEdge] error:', error)
        toast('Failed to delete connection', 'error')
        throw error
      }
    },
    onSuccess: () => invalidateBoard(qc, projectId),
  })
}

// ── Blockers ──────────────────────────────────────────────────────────────────

export function useCreateBlocker(projectId: string) {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ title, note, position_x, position_y }: { title: string; note?: string; position_x: number; position_y: number }) => {
      const id = crypto.randomUUID()
      const { error } = await supabase.from('board_blockers').insert({
        id,
        project_id: projectId,
        team_org_id: user!.team_org_id!,
        title: title.trim(),
        note: note?.trim() ?? null,
        position_x,
        position_y,
      })
      if (error) {
        console.error('[useCreateBlocker] error:', error)
        toast('Failed to create blocker', 'error')
        throw error
      }
      return id
    },
    onSuccess: () => invalidateBoard(qc, projectId),
  })
}

export function useUpdateBlocker(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; title?: string; note?: string | null; is_resolved?: boolean; resolved_at?: string | null }) => {
      const { error } = await supabase.from('board_blockers').update(updates).eq('id', id)
      if (error) {
        console.error('[useUpdateBlocker] error:', error)
        toast('Failed to update blocker', 'error')
        throw error
      }
    },
    onSuccess: () => invalidateBoard(qc, projectId),
  })
}

export function useUpdateBlockerPosition(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, position_x, position_y }: { id: string; position_x: number; position_y: number }) => {
      const { error } = await supabase.from('board_blockers').update({ position_x, position_y }).eq('id', id)
      if (error) {
        console.error('[useUpdateBlockerPosition] error:', error)
        throw error
      }
    },
    onSuccess: () => invalidateBoard(qc, projectId),
  })
}

export function useDeleteBlocker(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('board_blockers').delete().eq('id', id)
      if (error) {
        console.error('[useDeleteBlocker] error:', error)
        toast('Failed to delete blocker', 'error')
        throw error
      }
    },
    onSuccess: () => invalidateBoard(qc, projectId),
  })
}

// ── Timeline Phases ───────────────────────────────────────────────────────────

export function useCreatePhase(projectId: string) {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      name,
      color,
      start_date,
      end_date,
      sort_order,
    }: {
      name: string
      color: string
      start_date: string
      end_date: string
      sort_order?: number
    }) => {
      const id = crypto.randomUUID()
      const { error } = await supabase.from('timeline_phases').insert({
        id,
        project_id: projectId,
        team_org_id: user!.team_org_id!,
        name: name.trim(),
        color,
        start_date,
        end_date,
        sort_order: sort_order ?? 0,
      })
      if (error) {
        console.error('[useCreatePhase] error:', error)
        toast('Failed to create phase', 'error')
        throw error
      }
      return id
    },
    onSuccess: () => invalidateBoth(qc, projectId),
  })
}

export function useUpdatePhase(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string
      name?: string
      color?: string
      start_date?: string
      end_date?: string
    }) => {
      const { error } = await supabase.from('timeline_phases').update(updates).eq('id', id)
      if (error) {
        console.error('[useUpdatePhase] error:', error)
        toast('Failed to update phase', 'error')
        throw error
      }
    },
    onSuccess: () => invalidateBoth(qc, projectId),
  })
}

export function useDeletePhase(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('timeline_phases').delete().eq('id', id)
      if (error) {
        console.error('[useDeletePhase] error:', error)
        toast('Failed to delete phase', 'error')
        throw error
      }
    },
    onSuccess: () => invalidateBoth(qc, projectId),
  })
}

// ── Project dates ─────────────────────────────────────────────────────────────

export function useUpdateProjectDates(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ start_date, end_date }: { start_date: string; end_date: string }) => {
      const { error } = await supabase.from('projects').update({ start_date, end_date }).eq('id', projectId)
      if (error) {
        console.error('[useUpdateProjectDates] error:', error)
        toast('Failed to update project dates', 'error')
        throw error
      }
    },
    onSuccess: () => invalidateBoth(qc, projectId),
  })
}

// ── Sub-project due date (timeline chip drag) ─────────────────────────────────

export function useUpdateSubProjectDueDate(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, due_date, start_date }: { id: string; due_date: string | null; start_date?: string | null }) => {
      const updates: { due_date: string | null; start_date?: string | null } = { due_date }
      if (start_date !== undefined) updates.start_date = start_date
      const { error } = await supabase.from('sub_projects').update(updates).eq('id', id)
      if (error) {
        console.error('[useUpdateSubProjectDueDate] error:', error)
        toast('Failed to update due date', 'error')
        throw error
      }
    },
    onSuccess: () => invalidateBoth(qc, projectId),
  })
}
