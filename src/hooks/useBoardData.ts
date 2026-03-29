import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { DBDepartment, DBSubProject, DBSubProjectTask, DBBoardEdge, DBBoardBlocker, SubProjectWithTasks, BoardMember } from '@/lib/board'

export function useBoardData(projectId: string | null) {
  const user = useAuthStore(s => s.user)

  return useQuery({
    queryKey: ['board-data', projectId],
    enabled: !!projectId && !!user,
    queryFn: async () => {
      const [
        { data: depts, error: deptsErr },
        { data: subs, error: subsErr },
        { data: tasks, error: tasksErr },
        { data: edges, error: edgesErr },
        { data: blockers, error: blockersErr },
        { data: members, error: membersErr },
      ] = await Promise.all([
        supabase.from('board_departments').select('*').eq('project_id', projectId!).order('created_at'),
        supabase.from('sub_projects').select('*').eq('project_id', projectId!).order('created_at'),
        supabase.from('sub_project_tasks').select('*').eq('project_id', projectId!).order('sort_order'),
        supabase.from('board_edges').select('*').eq('project_id', projectId!),
        supabase.from('board_blockers').select('*').eq('project_id', projectId!).order('created_at'),
        supabase.from('users').select('id, display_name, avatar_color').eq('team_org_id', user!.team_org_id!),
      ])

      if (deptsErr) throw deptsErr
      if (subsErr) throw subsErr
      if (tasksErr) throw tasksErr
      if (edgesErr) throw edgesErr
      if (blockersErr) throw blockersErr
      if (membersErr) throw membersErr

      const memberMap = new Map<string, BoardMember>(
        (members as BoardMember[]).map(m => [m.id, m])
      )

      const subProjectsWithTasks: SubProjectWithTasks[] = (subs as DBSubProject[]).map(sp => ({
        ...sp,
        tasks: (tasks as DBSubProjectTask[]).filter(t => t.sub_project_id === sp.id),
        owner: sp.owner_id ? (memberMap.get(sp.owner_id) ?? null) : null,
      }))

      return {
        departments: depts as DBDepartment[],
        subProjects: subProjectsWithTasks,
        edges: edges as DBBoardEdge[],
        blockers: blockers as DBBoardBlocker[],
        members: members as BoardMember[],
      }
    },
  })
}
