/**
 * Async write queue with retry + localStorage fallback.
 * All Supabase writes go through here.
 */

const FALLBACK_KEY = 'compass_write_queue'
const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 3000, 9000]

interface QueueItem {
  id: string
  fn: () => Promise<unknown>
  retries: number
  serialized: string // for localStorage
}

// In-memory queue (fn can't be serialized, so we keep a parallel structure)
const queue: QueueItem[] = []
let isProcessing = false
let offlineMode = false

type WriteQueueListener = (offline: boolean) => void
const listeners: WriteQueueListener[] = []

export function onQueueStatusChange(fn: WriteQueueListener) {
  listeners.push(fn)
  return () => { const i = listeners.indexOf(fn); if (i > -1) listeners.splice(i, 1) }
}

function notifyListeners() {
  listeners.forEach(fn => fn(offlineMode))
}

export async function enqueue<T>(
  fn: () => Promise<T>,
  label = 'write'
): Promise<T> {
  return new Promise((resolve, reject) => {
    const item: QueueItem = {
      id: crypto.randomUUID(),
      fn: fn as () => Promise<unknown>,
      retries: 0,
      serialized: label,
    }
    queue.push(item)
    processQueue()

    // We can't perfectly wait for this item, so we run fn directly
    // and let the queue handle retries for failures
    fn()
      .then(result => resolve(result as T))
      .catch(async err => {
        // Retry logic
        for (let i = 0; i < MAX_RETRIES; i++) {
          await sleep(RETRY_DELAYS[i])
          try {
            const result = await fn()
            if (offlineMode) {
              offlineMode = false
              notifyListeners()
              flushLocalStorage()
            }
            resolve(result as T)
            return
          } catch {
            console.warn(`[queue] retry ${i + 1}/${MAX_RETRIES} failed for: ${label}`)
          }
        }
        // All retries exhausted — write to localStorage
        offlineMode = true
        notifyListeners()
        writeToLocalStorage(label)
        reject(err)
      })
  })
}

function processQueue() {
  if (isProcessing || queue.length === 0) return
  isProcessing = true
  const item = queue.shift()!
  item.fn().finally(() => {
    isProcessing = false
    processQueue()
  })
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

function writeToLocalStorage(label: string) {
  try {
    const existing = JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]') as string[]
    existing.push(JSON.stringify({ label, at: new Date().toISOString() }))
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(existing))
  } catch {}
}

export async function flushLocalStorage() {
  const raw = localStorage.getItem(FALLBACK_KEY)
  if (!raw) return
  // In a real app, we'd replay the actual operations.
  // Here we just clear and log.
  console.info('[queue] Flushing local buffer on reconnect')
  localStorage.removeItem(FALLBACK_KEY)
}

export function getPendingCount(): number {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY)
    if (!raw) return 0
    return (JSON.parse(raw) as unknown[]).length
  } catch { return 0 }
}

export function isOfflineMode() { return offlineMode }
