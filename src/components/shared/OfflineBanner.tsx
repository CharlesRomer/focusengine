import { useEffect, useState } from 'react'
import { onQueueStatusChange, isOfflineMode } from '@/lib/queue'

export function OfflineBanner() {
  const [offline, setOffline] = useState(isOfflineMode())

  useEffect(() => {
    return onQueueStatusChange(setOffline)
  }, [])

  if (!offline) return null

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 text-[var(--text-sm)]"
      style={{
        background: 'rgba(224,160,82,0.15)',
        borderBottom: '1px solid rgba(224,160,82,0.3)',
        color: 'var(--warning)',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <path d="M7 1a6 6 0 100 12A6 6 0 007 1zm0 9a.75.75 0 110 1.5A.75.75 0 017 10zm.5-6.5v4a.5.5 0 01-1 0v-4a.5.5 0 011 0z"/>
      </svg>
      Some data couldn't save. Will retry when connection restores.
    </div>
  )
}
