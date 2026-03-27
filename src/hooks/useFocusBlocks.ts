import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, type DBFocusBlock } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { toast } from '@/store/ui'

export function useFocusBlocksRange(startDate: string, endDate: string) {
  const user = useAuthStore(s => s.user)
  return useQuery({
    queryKey: ['focus_blocks', user?.id, startDate, endDate],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('focus_blocks')
        .select('*')
        .eq('user_id', user!.id)
        .gte('date', startDate)
        .lte('date', endDate)
        .is('deleted_at', null)
        .order('date').order('start_time')
      if (error) throw error
      return data as DBFocusBlock[]
    },
  })
}

export function useFocusBlocks(date: string) {
  const user = useAuthStore(s => s.user)
  return useQuery({
    queryKey: ['focus_blocks', user?.id, date],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('focus_blocks')
        .select('*')
        .eq('user_id', user!.id)
        .eq('date', date)
        .is('deleted_at', null)
        .order('start_time')
      if (error) throw error
      return data as DBFocusBlock[]
    },
  })
}

export function useCreateFocusBlock() {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (block: { name: string; date: string; start_time: string; end_time: string; commitment_id?: string | null }) => {
      const { data, error } = await supabase
        .from('focus_blocks')
        .insert({ ...block, user_id: user!.id })
        .select().single()
      if (error) throw error
      return data as DBFocusBlock
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['focus_blocks', user?.id, vars.date] }),
    onError: (e: Error) => toast(e.message, 'error'),
  })
}

export function useUpdateFocusBlock() {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DBFocusBlock> & { id: string }) => {
      const { error } = await supabase.from('focus_blocks').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['focus_blocks'] }),
    onError: (e: Error) => toast(e.message, 'error'),
  })
}

export function useDeleteFocusBlock() {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('focus_blocks').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['focus_blocks'] }),
    onError: (e: Error) => toast(e.message, 'error'),
  })
}
