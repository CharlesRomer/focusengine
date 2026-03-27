import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { BottomSheet } from '@/components/ui/Modal'

interface ProofUploadProps {
  open: boolean
  onClose: () => void
  onConfirm: (proofUrl: string, proofType: 'url') => void
  onSkip: () => void
  commitmentText: string
}

export function ProofUpload({ open, onClose, onConfirm, onSkip, commitmentText }: ProofUploadProps) {
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState('')

  function handleSubmit() {
    setUrlError('')
    if (!url.trim()) { setUrlError('Enter a URL'); return }
    try { new URL(url.trim()) } catch { setUrlError('Enter a valid URL'); return }
    onConfirm(url.trim(), 'url')
    setUrl('')
  }

  function handleSkip() {
    setUrl('')
    setUrlError('')
    onSkip()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Mark as done">
      <div className="flex flex-col gap-4">
        <p className="text-[var(--text-sm)] text-[var(--text-secondary)] -mt-2 truncate">
          "{commitmentText}"
        </p>

        <Input
          label="Proof link (optional)"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://notion.so/... or any URL"
          error={urlError}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          autoFocus
        />

        <div className="flex gap-2">
          <Button onClick={handleSkip} variant="secondary" className="flex-1">
            Done — no link
          </Button>
          <Button onClick={handleSubmit} className="flex-1" disabled={!url.trim()}>
            Done with link
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
