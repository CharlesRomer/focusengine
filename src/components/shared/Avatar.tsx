import { avatarHsl, getInitials } from '@/lib/avatar'

interface AvatarProps {
  userId: string
  name: string
  size?: number
}

export function Avatar({ userId, name, size = 28 }: AvatarProps) {
  const bg = avatarHsl(userId)
  const initials = getInitials(name)
  return (
    <div
      style={{
        width: size,
        height: size,
        background: bg,
        borderRadius: 'var(--radius-full)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {initials}
    </div>
  )
}
