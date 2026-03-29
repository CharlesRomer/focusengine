import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useBoardRealtime(projectId: string | null) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!projectId) return

    const channel = supabase
      .channel(`board-${projectId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sub_projects',
        filter: `project_id=eq.${projectId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['board-data', projectId] })
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sub_project_tasks',
        filter: `project_id=eq.${projectId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['board-data', projectId] })
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'board_blockers',
        filter: `project_id=eq.${projectId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['board-data', projectId] })
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'board_edges',
        filter: `project_id=eq.${projectId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['board-data', projectId] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId, qc])
}
