import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '@/store/auth'
import { useSessionStore } from '@/store/session'
import { supabase } from '@/lib/supabase'
import { toast } from '@/store/ui'
import { useQueryClient } from '@tanstack/react-query'

interface Props {
  open: boolean
  onClose: () => void
  /** Snapshot of the anchor button's bounding rect, used for positioning. */
  anchorRect: DOMRect | null
}

export function QuickCapturePopover({ open, onClose, anchorRect }: Props) {
  const user    = useAuthStore(s => s.user)
  const session = useSessionStore(s => s.activeSession)
  const qc      = useQueryClient()

  const [text, setText] = useState('')
  const inputRef   = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Auto-focus and clear on open
  useEffect(() => {
    if (!open) return
    setText('')
    setTimeout(() => inputRef.current?.focus(), 30)
  }, [open])

  // Escape closes
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  // Outside click closes
  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const t = setTimeout(() => document.addEventListener('mousedown', onMouseDown), 0)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onMouseDown) }
  }, [open, onClose])

  if (!open || !anchorRect) return null

  const W    = 280
  const left = Math.max(8, anchorRect.right - W)
  const top  = anchorRect.bottom + 8

  async function handleCapture() {
    const trimmed = text.trim()
    if (!trimmed || !user) return
    const { error } = await supabase
      .from('quick_captures')
      .insert({ user_id: user.id, text: trimmed, session_id: session?.id ?? null })
    if (error) { toast('Could not save capture', 'error'); return }
    qc.invalidateQueries({ queryKey: ['quick_captures'] })
    toast('Captured', 'success')
    onClose()
  }

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        left, top,
        width: W,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 10,
        padding: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        zIndex: 600,
      }}
    >
      <input
        ref={inputRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter')  handleCapture()
          if (e.key === 'Escape') { e.stopPropagation(); onClose() }
        }}
        placeholder="Capture a thought..."
        style={{
          display: 'block', width: '100%', boxSizing: 'border-box',
          background: 'transparent', border: 'none', outline: 'none',
          color: 'var(--text-primary)', fontSize: 14,
          fontFamily: 'var(--font-sans)',
          padding: 0,
          marginBottom: 6,
        }}
      />
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
        Press Enter to save, Esc to cancel
      </div>
    </div>
  )
}
