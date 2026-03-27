import { useQuery } from '@tanstack/react-query'
import { supabase, type DBActivityEvent } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { dayBounds } from '@/lib/time'

export function useActivityEvents(date: string) {
  const user = useAuthStore(s => s.user)
  const { start, end } = dayBounds(date)
  return useQuery({
    queryKey: ['activity_events', user?.id, date],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_events')
        .select('*')
        .eq('user_id', user!.id)
        .gte('started_at', start)
        .lt('started_at', end)
        .order('started_at')
      if (error) throw error
      return data as DBActivityEvent[]
    },
  })
}

export function useActivityEventsRange(startDate: string, endDate: string) {
  const user = useAuthStore(s => s.user)
  const { start } = dayBounds(startDate)
  const { end } = dayBounds(endDate)  // end is exclusive start of next day
  return useQuery({
    queryKey: ['activity_events', user?.id, startDate, endDate],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_events')
        .select('*')
        .eq('user_id', user!.id)
        .gte('started_at', start)
        .lt('started_at', end)
        .order('started_at')
      if (error) throw error
      return data as DBActivityEvent[]
    },
  })
}
