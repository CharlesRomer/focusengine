import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, type DBCommitment } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { toast } from '@/store/ui'
import { todayLocal } from '@/lib/time'

export function useCommitments(date?: string) {
  const user = useAuthStore(s => s.user)
  const targetDate = date ?? todayLocal()

  return useQuery({
    queryKey: ['commitments', user?.id, targetDate],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commitments')
        .select('*')
        .eq('user_id', user!.id)
        .eq('date', targetDate)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as DBCommitment[]
    },
  })
}

export function useAddCommitment(date?: string) {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()
  const targetDate = date ?? todayLocal()

  return useMutation({
    mutationFn: async ({ text, sub_project_id }: { text: string; sub_project_id?: string | null }) => {
      if (!user?.team_org_id) throw new Error('You must be in a team to add commitments')
      const { data, error } = await supabase
        .from('commitments')
        .insert({
          user_id: user!.id,
          team_org_id: user!.team_org_id,
          date: targetDate,
          text: text.trim(),
          sub_project_id: sub_project_id ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commitments'] }),
    onError: (e: Error) => toast(e.message, 'error'),
  })
}

export function useMarkDone() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, proofUrl, proofType }: { id: string; proofUrl?: string; proofType?: 'url' }) => {
      const { error } = await supabase
        .from('commitments')
        .update({ status: 'done', proof_url: proofUrl ?? null, proof_type: proofType ?? null })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: ['commitments'] })
      const prev = qc.getQueriesData({ queryKey: ['commitments'] })
      qc.setQueriesData({ queryKey: ['commitments'] }, (old: DBCommitment[] | undefined) =>
        old?.map(c => c.id === id ? { ...c, status: 'done' as const } : c)
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data))
      toast('Failed to mark commitment done', 'error')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['commitments'] }),
  })
}

export function useMarkIncomplete() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase
        .from('commitments')
        .update({ status: 'incomplete', incomplete_reason: reason })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: ['commitments'] })
      const prev = qc.getQueriesData({ queryKey: ['commitments'] })
      qc.setQueriesData({ queryKey: ['commitments'] }, (old: DBCommitment[] | undefined) =>
        old?.map(c => c.id === id ? { ...c, status: 'incomplete' as const } : c)
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data))
      toast('Failed to mark commitment incomplete', 'error')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['commitments'] }),
  })
}

export function useReopenCommitment() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('commitments')
        .update({ status: 'open', proof_url: null, proof_type: null, incomplete_reason: null })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['commitments'] })
      const prev = qc.getQueriesData({ queryKey: ['commitments'] })
      qc.setQueriesData({ queryKey: ['commitments'] }, (old: DBCommitment[] | undefined) =>
        old?.map(c => c.id === id ? { ...c, status: 'open' as const, proof_url: null, incomplete_reason: null } : c)
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data))
      toast('Failed to reopen commitment', 'error')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['commitments'] }),
  })
}

export function useDeleteCommitment() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('commitments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commitments'] }),
    onError: (e: Error) => toast(e.message, 'error'),
  })
}
