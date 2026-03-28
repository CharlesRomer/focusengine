import { useState, KeyboardEvent } from 'react'
import { format } from 'date-fns'
import { PulseCommitmentItem } from './PulseCommitmentItem'
import { avatarColor } from './MemberCard'
import { useAddCommitment } from '@/hooks/useCommitments'
import type { TeamMember } from '@/hooks/useTeamPulse'
import type { DBCommitment } from '@/lib/supabase'

type PulseCommitment = Pick<
  DBCommitment,
  'id' | 'user_id' | 'text' | 'status' | 'proof_url' | 'incomplete_reason' | 'deleted_at' | 'created_at'
>

interface Props {
  members: TeamMember[]
  commitments: PulseCommitment[]
  currentUserId: string
  loading: boolean
}

export function TodaysCommitments({ members, commitments, currentUserId, loading }: Props) {
  const today = format(new Date(), 'EEEE, MMM d')

  const sorted = [...members].sort((a, b) => {
    if (a.id === currentUserId) return -1
    if (b.id === currentUserId) return 1
    return a.display_name.localeCompare(b.display_name)
  })

  return (
    <div>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)' }}>
          Today's commitments
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{today}</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', gap: 16 }}>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton" style={{ flex: 1, minWidth: 220, height: 120, borderRadius: 8 }} />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
          No team members found
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          {sorted.map((member) => {
            const memberCommitments = commitments.filter((c) => c.user_id === member.id)
            const isOwn = member.id === currentUserId
            const nonDeleted = memberCommitments.filter((c) => !c.deleted_at)
            const doneCount = nonDeleted.filter((c) => c.status === 'done').length
            const totalCount = nonDeleted.length

            return (
              <MemberColumn
                key={member.id}
                member={member}
                commitments={memberCommitments}
                isOwn={isOwn}
                doneCount={doneCount}
                totalCount={totalCount}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Member column ─────────────────────────────────────────────────
function MemberColumn({
  member,
  commitments,
  isOwn,
  doneCount,
  totalCount,
}: {
  member: TeamMember
  commitments: PulseCommitment[]
  isOwn: boolean
  doneCount: number
  totalCount: number
}) {
  const [addText, setAddText] = useState('')
  const addCommitment = useAddCommitment()

  const canAdd = isOwn && totalCount < 5

  function handleAdd(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const trimmed = addText.trim()
    if (!trimmed) return
    addCommitment.mutate(trimmed)
    setAddText('')
  }

  // Sort: open first, done last
  const sorted = [...commitments].sort((a, b) => {
    const rank = { open: 0, incomplete: 1, done: 2 }
    const aStatus = a.deleted_at ? 'incomplete' : a.status
    const bStatus = b.deleted_at ? 'incomplete' : b.status
    return (rank[aStatus as keyof typeof rank] ?? 1) - (rank[bStatus as keyof typeof rank] ?? 1)
  })

  return (
    <div
      style={{
        flex: '1 1 220px',
        minWidth: 220,
        maxWidth: 320,
        borderLeft: isOwn ? '2px solid rgba(124,111,224,0.2)' : 'none',
        paddingLeft: isOwn ? 12 : 0,
      }}
    >
      {/* Column header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: avatarColor(member.id),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 500,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {member.display_name.slice(0, 1).toUpperCase()}
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {member.display_name}
        </span>
        {totalCount > 0 && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              background: 'var(--bg-elevated)',
              padding: '1px 6px',
              borderRadius: 10,
              flexShrink: 0,
            }}
          >
            {doneCount}/{totalCount}
          </span>
        )}
      </div>

      {/* Commitment items */}
      {sorted.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic', paddingLeft: 2 }}>
          No commitments set today
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {sorted.map((c) => (
            <PulseCommitmentItem key={c.id} commitment={c} isOwn={isOwn} />
          ))}
        </div>
      )}

      {/* Add commitment (own column only, < 3 commitments) */}
      {canAdd && (
        <input
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          onKeyDown={handleAdd}
          placeholder="Add commitment…"
          style={{
            marginTop: 8,
            width: '100%',
            background: 'none',
            border: 'none',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '4px 0',
            fontSize: 12,
            color: 'var(--text-secondary)',
            outline: 'none',
          }}
        />
      )}
    </div>
  )
}
