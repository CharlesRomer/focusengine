import { useState, useEffect } from 'react'
import { elapsedSeconds, formatHuman, timeAgo } from '@/lib/time'
import type { TeamMember, TeamSession, LastActivity } from '@/hooks/useTeamPulse'

// ── Avatar color from user_id ─────────────────────────────────────
function avatarHue(userId: string): number {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash + userId.charCodeAt(i)) % 360
  }
  return hash
}

export function avatarColor(userId: string): string {
  return `hsl(${avatarHue(userId)}, 45%, 38%)`
}

// ── Status derivation ─────────────────────────────────────────────
type MemberStatus = 'locked_in' | 'paused' | 'active' | 'offline'

function deriveStatus(
  member: TeamMember,
  session: TeamSession | undefined,
  lastActivity: LastActivity | undefined
): MemberStatus {
  if (session) {
    return session.status === 'paused' ? 'paused' : 'locked_in'
  }
  if (lastActivity) {
    const minsAgo = (Date.now() - new Date(lastActivity.lastActiveAt).getTime()) / 60_000
    if (minsAgo <= 30) return 'active'
  }
  return 'offline'
}

// ── Badge component ───────────────────────────────────────────────
function StatusBadge({ status }: { status: MemberStatus }) {
  const styles: Record<MemberStatus, { bg: string; color: string; label: string; border?: string }> = {
    locked_in: {
      bg: 'rgba(124,111,224,0.15)',
      color: '#9183F0',
      label: 'Locked in',
    },
    paused: {
      bg: 'rgba(224,160,82,0.15)',
      color: '#E0A052',
      label: 'Paused',
    },
    active: {
      bg: 'rgba(255,255,255,0.06)',
      color: 'var(--text-secondary)',
      label: 'Active',
    },
    offline: {
      bg: 'transparent',
      color: 'var(--text-tertiary)',
      label: 'Offline',
      border: '1px solid var(--border-subtle)',
    },
  }
  const s = styles[status]
  return (
    <span
      style={{
        fontSize: 10,
        padding: '2px 7px',
        borderRadius: 10,
        background: s.bg,
        color: s.color,
        border: s.border,
        fontWeight: 500,
        lineHeight: '16px',
        display: 'inline-block',
      }}
    >
      {s.label}
    </span>
  )
}

// ── Context line ──────────────────────────────────────────────────
function ContextLine({
  status,
  session,
  lastActivity,
  elapsed,
}: {
  status: MemberStatus
  session: TeamSession | undefined
  lastActivity: LastActivity | undefined
  elapsed: number
}) {
  if (status === 'locked_in' && session) {
    return (
      <span>
        {session.is_unplanned && <span title="Unplanned work">⚡ </span>}
        {session.name} · {formatHuman(elapsed)}
      </span>
    )
  }
  if (status === 'paused' && session) {
    return <span>{session.name} · paused</span>
  }
  if (status === 'active') {
    if (lastActivity?.appName) return <span>In {lastActivity.appName}</span>
    return <span>Active today</span>
  }
  // offline
  if (lastActivity?.lastActiveAt) {
    return <span>Last seen {timeAgo(lastActivity.lastActiveAt)}</span>
  }
  return <span>No activity yet</span>
}

// ── Member card ───────────────────────────────────────────────────
interface Props {
  member: TeamMember
  session: TeamSession | undefined
  lastActivity: LastActivity | undefined
}

export function MemberCard({ member, session, lastActivity }: Props) {
  const status = deriveStatus(member, session, lastActivity)

  // Elapsed time updates every 60s
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (status !== 'locked_in' || !session) return
    const update = () =>
      setElapsed(elapsedSeconds(session.started_at, session.total_pause_seconds))
    update()
    const t = setInterval(update, 60_000)
    return () => clearInterval(t)
  }, [status, session?.started_at, session?.total_pause_seconds])

  const isLockedIn = status === 'locked_in'

  return (
    <div
      style={{
        width: 180,
        flexShrink: 0,
        background: 'var(--bg-surface)',
        border: isLockedIn
          ? '1px solid rgba(124,111,224,0.25)'
          : '1px solid var(--border-subtle)',
        borderRadius: 12,
        padding: 16,
      }}
    >
      {/* Top row: avatar + badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: avatarColor(member.id),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 500,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {member.display_name.slice(0, 1).toUpperCase()}
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Name */}
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--text-primary)',
          marginTop: 10,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {member.display_name}
      </div>

      {/* Context line */}
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-tertiary)',
          marginTop: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        <ContextLine
          status={status}
          session={session}
          lastActivity={lastActivity}
          elapsed={elapsed}
        />
      </div>
    </div>
  )
}

// ── Skeleton card ─────────────────────────────────────────────────
export function MemberCardSkeleton() {
  return (
    <div
      style={{
        width: 180,
        flexShrink: 0,
        background: 'var(--bg-hover)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 12,
        padding: 16,
        height: 110,
      }}
      className="skeleton"
    />
  )
}
