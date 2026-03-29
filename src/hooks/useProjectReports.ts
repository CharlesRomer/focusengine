import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { parseISO, isValid, differenceInDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from 'date-fns'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RawProject {
  id: string
  name: string
  color: string
  status: string
  created_at: string
  start_date: string | null
  end_date: string | null
}

export interface RawSubProject {
  id: string
  project_id: string
  name: string
  status: string
  due_date: string | null
  owner_id: string | null
  created_at: string
  updated_at: string
}

export interface RawTask {
  id: string
  sub_project_id: string
  title: string
  owner_id: string | null
  is_complete: boolean
  proof_url: string | null
  created_at: string
  updated_at: string
}

export interface RawBlocker {
  id: string
  project_id: string
  title: string
  is_resolved: boolean
  created_at: string
  resolved_at: string | null
}

export interface RawMember {
  id: string
  display_name: string
  avatar_color: string | null
}

// ── Computed types ────────────────────────────────────────────────────────────

export interface ProjectMetrics {
  project: RawProject
  totalTasks: number
  completedTasks: number
  openTasks: number
  completionRate: number
  totalSubProjects: number
  subProjectsByStatus: Record<string, number>
  openBlockers: number
  resolvedBlockers: number
  avgBlockerResolutionDays: number | null
  isOverdue: boolean
  daysOpen: number
}

export interface MemberMetrics {
  member: RawMember
  totalAssigned: number
  totalCompleted: number
  openTasks: number
  completionRate: number
  avgCompletionDays: number | null
  overdueSubProjects: number
  velocityScore: number   // normalized 0–100
  workloadScore: number   // 0–1
}

export interface WeeklyBucket {
  weekStart: string
  count: number
}

export interface ProjectReportsData {
  projects: RawProject[]
  projectMetrics: ProjectMetrics[]
  memberMetrics: MemberMetrics[]
  avgTaskAgeDays: number | null
  oldestOpenTask: { title: string; ownerName: string | null; subProjectName: string; ageDays: number } | null
  tasksWithProofUrl: number
  totalCompletedTasks: number
  tasksCompletedThisWeek: number
  tasksCompletedLastWeek: number
  subProjectsCompletedThisMonth: number
  subProjectsCompletedLastMonth: number
  blockersOpenedThisMonth: number
  weeklyTaskCompletions: WeeklyBucket[]
  documentationRate: number | null
  memberDocRates: { member: RawMember; rate: number | null; completed: number; withProof: number }[]
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function safeDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = parseISO(s)
  return isValid(d) ? d : null
}

export function useProjectReports() {
  const user = useAuthStore(s => s.user)
  const teamOrgId = user?.team_org_id

  const query = useQuery({
    queryKey: ['project-reports', teamOrgId],
    enabled: !!teamOrgId,
    staleTime: 60_000,
    queryFn: async () => {
      const [
        projectsRes,
        subProjectsRes,
        tasksRes,
        blockersRes,
        membersRes,
      ] = await Promise.all([
        supabase.from('projects').select('id,name,color,status,created_at,start_date,end_date').eq('team_org_id', teamOrgId!).eq('status', 'active'),
        supabase.from('sub_projects').select('id,project_id,name,status,due_date,owner_id,created_at,updated_at').eq('team_org_id', teamOrgId!),
        supabase.from('sub_project_tasks').select('id,sub_project_id,title,owner_id,is_complete,proof_url,created_at,updated_at').eq('team_org_id', teamOrgId!),
        supabase.from('board_blockers').select('id,project_id,title,is_resolved,created_at,resolved_at').eq('team_org_id', teamOrgId!),
        supabase.from('users').select('id,display_name,avatar_color').eq('team_org_id', teamOrgId!),
      ])

      if (projectsRes.error) throw projectsRes.error
      if (subProjectsRes.error) throw subProjectsRes.error
      if (tasksRes.error) throw tasksRes.error
      if (blockersRes.error) throw blockersRes.error
      if (membersRes.error) throw membersRes.error

      return {
        projects: (projectsRes.data ?? []) as RawProject[],
        subProjects: (subProjectsRes.data ?? []) as RawSubProject[],
        tasks: (tasksRes.data ?? []) as RawTask[],
        blockers: (blockersRes.data ?? []) as RawBlocker[],
        members: (membersRes.data ?? []) as RawMember[],
      }
    },
  })

  const computed = useMemo((): ProjectReportsData | null => {
    if (!query.data) return null
    const { projects, subProjects, tasks, blockers, members } = query.data
    const today = new Date()

    // ── Index maps ────────────────────────────────────────────────────────────

    const subsByProject = new Map<string, RawSubProject[]>()
    for (const sp of subProjects) {
      if (!subsByProject.has(sp.project_id)) subsByProject.set(sp.project_id, [])
      subsByProject.get(sp.project_id)!.push(sp)
    }

    const tasksBySub = new Map<string, RawTask[]>()
    for (const t of tasks) {
      if (!tasksBySub.has(t.sub_project_id)) tasksBySub.set(t.sub_project_id, [])
      tasksBySub.get(t.sub_project_id)!.push(t)
    }

    const blockersByProject = new Map<string, RawBlocker[]>()
    for (const b of blockers) {
      if (!blockersByProject.has(b.project_id)) blockersByProject.set(b.project_id, [])
      blockersByProject.get(b.project_id)!.push(b)
    }

    const memberById = new Map<string, RawMember>()
    for (const m of members) memberById.set(m.id, m)

    const subById = new Map<string, RawSubProject>()
    for (const sp of subProjects) subById.set(sp.id, sp)

    // ── Project metrics ───────────────────────────────────────────────────────

    const projectMetrics: ProjectMetrics[] = projects.map(proj => {
      const subs = subsByProject.get(proj.id) ?? []
      const projTasks = subs.flatMap(sp => tasksBySub.get(sp.id) ?? [])
      const totalTasks = projTasks.length
      const completedTasks = projTasks.filter(t => t.is_complete).length
      const openTasks = totalTasks - completedTasks
      const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

      const subProjectsByStatus: Record<string, number> = {}
      for (const sp of subs) {
        subProjectsByStatus[sp.status] = (subProjectsByStatus[sp.status] ?? 0) + 1
      }

      const projBlockers = blockersByProject.get(proj.id) ?? []
      const openBlockers = projBlockers.filter(b => !b.is_resolved).length
      const resolvedBlockers = projBlockers.filter(b => b.is_resolved)
      const resolvedCount = resolvedBlockers.length

      let avgBlockerResolutionDays: number | null = null
      if (resolvedCount > 0) {
        const totalDays = resolvedBlockers.reduce((acc, b) => {
          const created = safeDate(b.created_at)
          const resolved = safeDate(b.resolved_at)
          if (!created || !resolved) return acc
          return acc + differenceInDays(resolved, created)
        }, 0)
        avgBlockerResolutionDays = parseFloat((totalDays / resolvedCount).toFixed(1))
      }

      const isOverdue = subs.some(sp => {
        const due = safeDate(sp.due_date)
        return due && due < today && sp.status !== 'complete'
      })

      const created = safeDate(proj.created_at)
      const daysOpen = created ? differenceInDays(today, created) : 0

      return {
        project: proj,
        totalTasks,
        completedTasks,
        openTasks,
        completionRate: parseFloat(completionRate.toFixed(1)),
        totalSubProjects: subs.length,
        subProjectsByStatus,
        openBlockers,
        resolvedBlockers: resolvedCount,
        avgBlockerResolutionDays,
        isOverdue,
        daysOpen,
      }
    })

    // ── Member metrics ────────────────────────────────────────────────────────

    const memberTaskMap = new Map<string, RawTask[]>()
    for (const t of tasks) {
      if (!t.owner_id) continue
      if (!memberTaskMap.has(t.owner_id)) memberTaskMap.set(t.owner_id, [])
      memberTaskMap.get(t.owner_id)!.push(t)
    }

    const rawMemberMetrics = members
      .filter(m => memberTaskMap.has(m.id))
      .map(member => {
        const memberTasks = memberTaskMap.get(member.id)!
        const totalAssigned = memberTasks.length
        const completedTasks = memberTasks.filter(t => t.is_complete)
        const totalCompleted = completedTasks.length
        const openTasks = totalAssigned - totalCompleted
        const completionRate = totalAssigned > 0 ? (totalCompleted / totalAssigned) * 100 : 0

        let avgCompletionDays: number | null = null
        if (completedTasks.length > 0) {
          const totalDays = completedTasks.reduce((acc, t) => {
            const created = safeDate(t.created_at)
            const updated = safeDate(t.updated_at)
            if (!created || !updated) return acc
            return acc + Math.max(0, differenceInDays(updated, created))
          }, 0)
          avgCompletionDays = parseFloat((totalDays / completedTasks.length).toFixed(1))
        }

        const overdueSubProjects = subProjects.filter(sp => {
          if (sp.owner_id !== member.id) return false
          const due = safeDate(sp.due_date)
          return due && due < today && sp.status !== 'complete'
        }).length

        const rawVelocity =
          (completionRate / 100) * 0.5 +
          (1 / Math.max(avgCompletionDays ?? 1, 1)) * 0.5

        return {
          member,
          totalAssigned,
          totalCompleted,
          openTasks,
          completionRate: parseFloat(completionRate.toFixed(1)),
          avgCompletionDays,
          overdueSubProjects,
          rawVelocity,
          workloadScore: openTasks / Math.max(totalAssigned, 1),
        }
      })

    // Normalize velocityScore to 0–100
    const maxRaw = Math.max(...rawMemberMetrics.map(m => m.rawVelocity), 0.0001)
    const memberMetrics: MemberMetrics[] = rawMemberMetrics.map(m => ({
      member: m.member,
      totalAssigned: m.totalAssigned,
      totalCompleted: m.totalCompleted,
      openTasks: m.openTasks,
      completionRate: m.completionRate,
      avgCompletionDays: m.avgCompletionDays,
      overdueSubProjects: m.overdueSubProjects,
      velocityScore: parseFloat(((m.rawVelocity / maxRaw) * 100).toFixed(1)),
      workloadScore: parseFloat(m.workloadScore.toFixed(2)),
    }))

    // ── Task age ──────────────────────────────────────────────────────────────

    const openTasks = tasks.filter(t => !t.is_complete)
    let avgTaskAgeDays: number | null = null
    let oldestOpenTask: ProjectReportsData['oldestOpenTask'] = null

    if (openTasks.length > 0) {
      const ages = openTasks.map(t => {
        const created = safeDate(t.created_at)
        return created ? differenceInDays(today, created) : 0
      })
      avgTaskAgeDays = parseFloat((ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1))

      const oldest = openTasks.reduce((prev, curr) => {
        const pa = safeDate(prev.created_at)
        const ca = safeDate(curr.created_at)
        if (!pa) return curr
        if (!ca) return prev
        return ca < pa ? curr : prev
      })
      const oldestAge = safeDate(oldest.created_at) ? differenceInDays(today, safeDate(oldest.created_at)!) : 0
      const ownerMember = oldest.owner_id ? memberById.get(oldest.owner_id) : null
      const sub = subById.get(oldest.sub_project_id)
      oldestOpenTask = {
        title: oldest.title,
        ownerName: ownerMember?.display_name ?? null,
        subProjectName: sub?.name ?? '—',
        ageDays: oldestAge,
      }
    }

    const tasksWithProofUrl = tasks.filter(t => t.is_complete && t.proof_url).length
    const totalCompletedTasks = tasks.filter(t => t.is_complete).length

    // ── Velocity trends ───────────────────────────────────────────────────────

    const now = new Date()
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 })
    const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 })
    const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })
    const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })
    const thisMonthStart = startOfMonth(now)
    const thisMonthEnd = endOfMonth(now)
    const lastMonthStart = startOfMonth(subMonths(now, 1))
    const lastMonthEnd = endOfMonth(subMonths(now, 1))

    const tasksCompletedThisWeek = tasks.filter(t => {
      if (!t.is_complete) return false
      const d = safeDate(t.updated_at)
      return d && d >= thisWeekStart && d <= thisWeekEnd
    }).length

    const tasksCompletedLastWeek = tasks.filter(t => {
      if (!t.is_complete) return false
      const d = safeDate(t.updated_at)
      return d && d >= lastWeekStart && d <= lastWeekEnd
    }).length

    const subProjectsCompletedThisMonth = subProjects.filter(sp => {
      if (sp.status !== 'complete') return false
      const d = safeDate(sp.updated_at)
      return d && d >= thisMonthStart && d <= thisMonthEnd
    }).length

    const subProjectsCompletedLastMonth = subProjects.filter(sp => {
      if (sp.status !== 'complete') return false
      const d = safeDate(sp.updated_at)
      return d && d >= lastMonthStart && d <= lastMonthEnd
    }).length

    const blockersOpenedThisMonth = blockers.filter(b => {
      const d = safeDate(b.created_at)
      return d && d >= thisMonthStart && d <= thisMonthEnd
    }).length

    // 8-week completion history
    const weeklyTaskCompletions: WeeklyBucket[] = []
    for (let w = 7; w >= 0; w--) {
      const weekAgo = subWeeks(now, w)
      const wStart = startOfWeek(weekAgo, { weekStartsOn: 1 })
      const wEnd = endOfWeek(weekAgo, { weekStartsOn: 1 })
      const count = tasks.filter(t => {
        if (!t.is_complete) return false
        const d = safeDate(t.updated_at)
        return d && d >= wStart && d <= wEnd
      }).length
      weeklyTaskCompletions.push({
        weekStart: wStart.toISOString().slice(0, 10),
        count,
      })
    }

    // ── Documentation rate ────────────────────────────────────────────────────

    const documentationRate = totalCompletedTasks > 0
      ? parseFloat(((tasksWithProofUrl / totalCompletedTasks) * 100).toFixed(1))
      : null

    const memberDocRates = members.map(m => {
      const memberTasks = memberTaskMap.get(m.id) ?? []
      const completed = memberTasks.filter(t => t.is_complete).length
      const withProof = memberTasks.filter(t => t.is_complete && t.proof_url).length
      const rate = completed > 0 ? parseFloat(((withProof / completed) * 100).toFixed(1)) : null
      return { member: m, rate, completed, withProof }
    }).filter(m => m.completed > 0)

    return {
      projects,
      projectMetrics,
      memberMetrics,
      avgTaskAgeDays,
      oldestOpenTask,
      tasksWithProofUrl,
      totalCompletedTasks,
      tasksCompletedThisWeek,
      tasksCompletedLastWeek,
      subProjectsCompletedThisMonth,
      subProjectsCompletedLastMonth,
      blockersOpenedThisMonth,
      weeklyTaskCompletions,
      documentationRate,
      memberDocRates,
    }
  }, [query.data])

  return {
    data: computed,
    isLoading: query.isLoading,
    isError: query.isError,
    rawData: query.data,
  }
}
