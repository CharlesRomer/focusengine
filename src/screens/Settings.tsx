import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { toast } from '@/store/ui'

// ── Connection status ─────────────────────────────────────────────

type AgentStatus = 'loading' | 'connected' | 'never' | 'stale'

function useAgentStatus(userId: string | undefined) {
  const [status,   setStatus]   = useState<AgentStatus>('loading')
  const [lastPing, setLastPing] = useState<Date | null>(null)

  useEffect(() => {
    if (!userId) return
    // Find most recent raw_event from this user
    supabase
      .from('raw_events')
      .select('recorded_at')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          setStatus('never')
          return
        }
        const last = new Date(data.recorded_at)
        setLastPing(last)
        const diffMins = (Date.now() - last.getTime()) / 60_000
        setStatus(diffMins < 2 ? 'connected' : 'stale')
      })
  }, [userId])

  return { status, lastPing }
}

// ── Helpers ───────────────────────────────────────────────────────

function fmtRelative(d: Date): string {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000)
  if (secs < 60)   return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

// ── Component ─────────────────────────────────────────────────────

export function SettingsScreen() {
  const user = useAuthStore(s => s.user)
  const { status, lastPing } = useAgentStatus(user?.id)

  const [agentToken,  setAgentToken]  = useState<string | null>(null)
  const [copied,      setCopied]      = useState(false)
  const [testing,     setTesting]     = useState(false)
  const [testResult,  setTestResult]  = useState<'ok' | 'fail' | null>(null)
  const [tab,         setTab]         = useState<'agent' | 'profile'>('agent')

  // Load agent token
  useEffect(() => {
    if (!user) return
    supabase
      .from('users')
      .select('agent_token')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { if (data) setAgentToken(data.agent_token) })
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function copyToken() {
    if (!agentToken) return
    navigator.clipboard.writeText(agentToken).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function testConnection() {
    if (!user) return
    setTesting(true)
    setTestResult(null)
    // Check for a raw_event in the last 5 minutes
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('raw_events')
      .select('id')
      .eq('user_id', user.id)
      .gte('recorded_at', since)
      .limit(1)
      .maybeSingle()
    setTesting(false)
    setTestResult(data ? 'ok' : 'fail')
  }

  const statusDot: Record<AgentStatus, string> = {
    loading:   'var(--text-tertiary)',
    connected: 'var(--success)',
    stale:     'var(--warning)',
    never:     'var(--text-tertiary)',
  }
  const statusLabel: Record<AgentStatus, string> = {
    loading:   'Checking...',
    connected: 'Connected',
    stale:     lastPing ? `Last seen ${fmtRelative(lastPing)}` : 'Not recently active',
    never:     'Not installed',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Page header */}
      <div style={{
        flexShrink: 0, padding: '24px 32px 0',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <h1 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
          Settings
        </h1>
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0 }}>
          {(['agent', 'profile'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '8px 16px',
                background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
                color: tab === t ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: 13, fontWeight: tab === t ? 600 : 400,
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
                transition: 'color 150ms, border-color 150ms',
                textTransform: 'capitalize',
                marginBottom: -1,
              }}
            >
              {t === 'agent' ? 'macOS Agent' : 'Profile'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>

        {tab === 'agent' && (
          <div style={{ maxWidth: 540, display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Status card */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 12, padding: '16px 20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Connection status</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: statusDot[status],
                  }} />
                  <span style={{ fontSize: 12, color: status === 'connected' ? 'var(--success)' : 'var(--text-secondary)' }}>
                    {statusLabel[status]}
                  </span>
                </div>
              </div>

              {/* Token row */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                  Your agent token
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <code style={{
                    flex: 1, display: 'block',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 6, padding: '6px 10px',
                    fontSize: 12, color: 'var(--text-secondary)',
                    fontFamily: 'monospace',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {agentToken ?? '—'}
                  </code>
                  <button
                    onClick={copyToken}
                    disabled={!agentToken}
                    style={{
                      flexShrink: 0,
                      padding: '6px 14px',
                      background: copied ? 'var(--success)' : 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 6,
                      color: copied ? 'white' : 'var(--text-secondary)',
                      fontSize: 12, cursor: agentToken ? 'pointer' : 'not-allowed',
                      fontFamily: 'var(--font-sans)',
                      transition: 'background 150ms, color 150ms',
                    }}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Test connection */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={() => void testConnection()}
                  disabled={testing}
                  style={{
                    padding: '6px 14px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 6,
                    color: 'var(--text-secondary)', fontSize: 12,
                    cursor: testing ? 'wait' : 'pointer',
                    fontFamily: 'var(--font-sans)',
                    transition: 'background 150ms',
                  }}
                >
                  {testing ? 'Testing...' : 'Test connection'}
                </button>
                {testResult === 'ok' && (
                  <span style={{ fontSize: 12, color: 'var(--success)' }}>✓ Agent is sending data</span>
                )}
                {testResult === 'fail' && (
                  <span style={{ fontSize: 12, color: 'var(--warning)' }}>No data received in the last 5 minutes</span>
                )}
              </div>
            </div>

            {/* Install instructions */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 12, padding: '16px 20px',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
                Installation
              </div>
              <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  'Copy your agent token above',
                  'Open Terminal and run the install script:',
                  'Follow the prompts — paste your token when asked',
                  'The agent starts automatically and runs in the background',
                ].map((step, i) => (
                  <li key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {step}
                    {i === 1 && (
                      <pre style={{
                        display: 'block', marginTop: 6,
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 6, padding: '8px 12px',
                        fontSize: 12, color: 'var(--text-primary)',
                        fontFamily: 'monospace',
                        overflowX: 'auto',
                      }}>
                        {'curl -sSL https://focusengine-one.vercel.app/install-agent.sh | bash'}
                      </pre>
                    )}
                  </li>
                ))}
              </ol>
            </div>

            {/* Troubleshooting */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 12, padding: '16px 20px',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>
                Troubleshooting
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { q: 'Agent not starting?', a: 'Check ~/Library/LaunchAgents/com.compass.tracker.plist and run: launchctl load ~/Library/LaunchAgents/com.compass.tracker.plist' },
                  { q: 'Permission denied errors?', a: 'macOS may prompt for accessibility permissions. Go to System Settings > Privacy & Security > Accessibility and enable Terminal or your shell.' },
                  { q: 'Browser tabs not tracked?', a: 'AppleScript access is required. Enable in System Settings > Privacy & Security > Automation.' },
                  { q: 'View agent logs', a: 'tail -f ~/.compass/tracker.log' },
                ].map((item, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>
                      {item.q}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                      {item.a}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {tab === 'profile' && (
          <div style={{ maxWidth: 400, color: 'var(--text-secondary)', fontSize: 13 }}>
            <p>Profile settings — Phase 8</p>
          </div>
        )}

      </div>
    </div>
  )
}
