import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, type DBQuickCapture } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { toast } from '@/store/ui'
import { todayLocal, dayBounds } from '@/lib/time'

export function useQuickCaptures(date?: string) {
  const user = useAuthStore(s => s.user)
  const targetDate = date ?? todayLocal()
  const { start, end } = dayBounds(targetDate)

  return useQuery({
    queryKey: ['quick_captures', user?.id, targetDate],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quick_captures')
        .select('*')
        .eq('user_id', user!.id)
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as DBQuickCapture[]
    },
  })
}

export function useAddQuickCapture() {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (text: string) => {
      const { error } = await supabase
        .from('quick_captures')
        .insert({ user_id: user!.id, text: text.trim() })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quick_captures'] }),
    onError: (e: Error) => toast(e.message, 'error'),
  })
}
