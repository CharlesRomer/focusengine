import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { toast } from '@/store/ui'
import type { DBProject } from '@/lib/board'

export function useProjects() {
  const user = useAuthStore(s => s.user)

  return useQuery({
    queryKey: ['projects', user?.team_org_id],
    enabled: !!user?.team_org_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('team_org_id', user!.team_org_id!)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as DBProject[]
    },
  })
}

export function useCreateProject() {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ name, description, color }: { name: string; description?: string; color?: string }) => {
      if (!user?.team_org_id) throw new Error('Must be in a team')
      const id = crypto.randomUUID()
      const { error } = await supabase
        .from('projects')
        .insert({
          id,
          team_org_id: user.team_org_id,
          name: name.trim(),
          description: description?.trim() ?? null,
          color: color ?? '#7C6FE0',
          created_by: user.id,
        })
      if (error) {
        console.error('[useCreateProject] error:', error)
        toast('Failed to create project', 'error')
        throw error
      }
      return id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; description?: string; color?: string; status?: DBProject['status'] }) => {
      const { error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', id)
      if (error) {
        console.error('[useUpdateProject] error:', error)
        toast('Failed to update project', 'error')
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

// Debounced viewport save — called by the Board canvas on viewport change
export function useUpdateProjectViewport() {
  return useMutation({
    mutationFn: async ({ id, viewport }: { id: string; viewport: { x: number; y: number; zoom: number } }) => {
      const { error } = await supabase
        .from('projects')
        .update({ canvas_viewport: viewport })
        .eq('id', id)
      if (error) {
        console.error('[useUpdateProjectViewport] error:', error)
        // Don't toast on viewport save failures — too noisy
      }
    },
  })
}
