import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { DBProject, DBTimelinePhase, DBSubProject } from '@/lib/board'

export function useTimelineData(projectId: string | null) {
  const user = useAuthStore(s => s.user)

  return useQuery({
    queryKey: ['timeline-data', projectId],
    enabled: !!projectId && !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const [
        { data: project, error: projectErr },
        { data: phases, error: phasesErr },
        { data: subs, error: subsErr },
        { data: tasks, error: tasksErr },
      ] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId!).single(),
        supabase.from('timeline_phases').select('*').eq('project_id', projectId!).order('sort_order'),
        supabase.from('sub_projects').select('*').eq('project_id', projectId!).order('created_at'),
        supabase.from('sub_project_tasks').select('id, sub_project_id, is_complete').eq('team_org_id', user!.team_org_id!),
      ])

      if (projectErr) throw projectErr
      if (phasesErr) throw phasesErr
      if (subsErr) throw subsErr
      if (tasksErr) throw tasksErr

      // Attach task counts to sub_projects
      const subProjectsWithCounts = (subs as DBSubProject[]).map(sp => {
        const spTasks = (tasks as { id: string; sub_project_id: string; is_complete: boolean }[]).filter(t => t.sub_project_id === sp.id)
        return {
          ...sp,
          taskTotal: spTasks.length,
          taskComplete: spTasks.filter(t => t.is_complete).length,
        }
      })

      return {
        project: project as DBProject,
        phases: phases as DBTimelinePhase[],
        subProjects: subProjectsWithCounts,
      }
    },
  })
}
