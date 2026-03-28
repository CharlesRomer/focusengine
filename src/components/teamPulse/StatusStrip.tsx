import { MemberCard, MemberCardSkeleton } from './MemberCard'
import type { TeamMember, TeamSession, LastActivity } from '@/hooks/useTeamPulse'

interface Props {
  members: TeamMember[]
  sessions: TeamSession[]
  lastActivity: Map<string, LastActivity>
  loading: boolean
  currentUserId: string
}

export function StatusStrip({ members, sessions, lastActivity, loading, currentUserId }: Props) {
  const sessionByUser = new Map(sessions.map((s) => [s.user_id, s]))

  // Sort: current user first, then alphabetical
  const sorted = [...members].sort((a, b) => {
    if (a.id === currentUserId) return -1
    if (b.id === currentUserId) return 1
    return a.display_name.localeCompare(b.display_name)
  })

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        overflowX: 'auto',
        paddingBottom: 4,
        scrollbarWidth: 'thin',
      }}
    >
      {loading
        ? Array.from({ length: 4 }, (_, i) => <MemberCardSkeleton key={i} />)
        : sorted.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              session={sessionByUser.get(member.id)}
              lastActivity={lastActivity.get(member.id)}
            />
          ))}
    </div>
  )
}
