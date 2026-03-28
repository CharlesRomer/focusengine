import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { toast } from '@/store/ui'

// ── Agent connection status ───────────────────────────────────────

type AgentStatus = 'loading' | 'connected' | 'never' | 'stale'

function useAgentStatus(userId: string | undefined) {
  const [status,   setStatus]   = useState<AgentStatus>('loading')
  const [lastPing, setLastPing] = useState<Date | null>(null)

  useEffect(() => {
    if (!userId) return
    supabase
      .from('activity_events')
      .select('started_at')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { setStatus('never'); return }
        const last = new Date(data.started_at)
        setLastPing(last)
        const diffMins = (Date.now() - last.getTime()) / 60_000
        setStatus(diffMins < 5 ? 'connected' : 'stale')
      })
  }, [userId])

  return { status, lastPing }
}

// ── Team data ─────────────────────────────────────────────────────

interface TeamData {
  id: string
  name: string
  team_code: string
}

function useTeamData(teamOrgId: string | null) {
  const [team, setTeam] = useState<TeamData | null>(null)
  useEffect(() => {
    if (!teamOrgId) return
    supabase
      .from('teams')
      .select('id, name, team_code')
      .eq('id', teamOrgId)
      .single()
      .then(({ data }) => { if (data) setTeam(data as TeamData) })
  }, [teamOrgId])
  return team
}

// ── Copy button ───────────────────────────────────────────────────

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={copy}
      style={{
        flexShrink: 0,
        padding: '5px 12px',
        background: copied ? 'var(--success)' : 'var(--bg-elevated)',
        border: `1px solid ${copied ? 'var(--success)' : 'var(--border-default)'}`,
        borderRadius: 6,
        color: copied ? 'white' : 'var(--text-secondary)',
        fontSize: 12,
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        transition: 'background 150ms, color 150ms, border-color 150ms',
        whiteSpace: 'nowrap',
      }}
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}

function CodeRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <code style={{
          flex: 1,
          display: 'block',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 12,
          color: 'var(--text-secondary)',
          fontFamily: 'monospace',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {value || '—'}
        </code>
        {value && <CopyButton value={value} />}
      </div>
    </div>
  )
}

function fmtRelative(d: Date): string {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000)
  if (secs < 60)    return 'just now'
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

// ── Main component ────────────────────────────────────────────────

export function SettingsScreen() {
  const user = useAuthStore(s => s.user)
  const { status, lastPing } = useAgentStatus(user?.id)
  const team = useTeamData(user?.team_org_id ?? null)

  const [agentToken, setAgentToken] = useState<string | null>(null)
  const [tab, setTab]               = useState<'agent' | 'team' | 'profile'>('agent')
  const [testing, setTesting]       = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null)

  useEffect(() => {
    if (!user) return
    supabase.from('users').select('agent_token').eq('id', user.id).single()
      .then(({ data }) => { if (data) setAgentToken(data.agent_token) })
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function testConnection() {
    if (!user) return
    setTesting(true)
    setTestResult(null)
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('activity_events')
      .select('id')
      .eq('user_id', user.id)
      .gte('started_at', since)
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
    connected: 'Connected — tracking active',
    stale:     lastPing ? `Last seen ${fmtRelative(lastPing)}` : 'Not recently active',
    never:     'Not yet connected',
  }

  const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL as string
  const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const inviteLink   = team ? `${window.location.origin}?join=${team.team_code}` : ''

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'agent',   label: 'macOS Tracker' },
    { key: 'team',    label: 'Team & invite' },
    { key: 'profile', label: 'Profile' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: '24px 32px 0', borderBottom: '1px solid var(--border-subtle)' }}>
        <h1 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
          Settings
        </h1>
        <div style={{ display: 'flex', gap: 0 }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '8px 16px',
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${tab === t.key ? 'var(--accent)' : 'transparent'}`,
                color: tab === t.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: 13,
                fontWeight: tab === t.key ? 600 : 400,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                transition: 'color 150ms, border-color 150ms',
                marginBottom: -1,
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>

        {/* ── macOS Tracker tab ──────────────────────────────── */}
        {tab === 'agent' && (
          <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Connection status */}
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Connection status
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusDot[status] }} />
                  <span style={{ fontSize: 12, color: status === 'connected' ? 'var(--success)' : 'var(--text-secondary)' }}>
                    {statusLabel[status]}
                  </span>
                </div>
              </div>
              <button
                onClick={() => void testConnection()}
                disabled={testing}
                style={{
                  padding: '6px 14px',
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 6,
                  color: 'var(--text-secondary)',
                  fontSize: 12,
                  cursor: testing ? 'wait' : 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {testing ? 'Testing...' : 'Test connection'}
              </button>
              {testResult === 'ok' && (
                <span style={{ fontSize: 12, color: 'var(--success)', marginLeft: 10 }}>✓ Tracker is sending data</span>
              )}
              {testResult === 'fail' && (
                <span style={{ fontSize: 12, color: 'var(--warning)', marginLeft: 10 }}>
                  No data in the last 5 minutes — is the app running?
                </span>
              )}
            </Card>

            {/* Install guide */}
            <Card>
              <SectionTitle>Install the macOS tracker</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                {/* Step 1 — Download */}
                <Step n={1} title="Download the app">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                    <a
                      href="/CompassTracker.zip"
                      download
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 16px',
                        background: 'var(--accent)',
                        color: '#fff',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 500,
                        textDecoration: 'none',
                        transition: 'opacity 150ms',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                    >
                      ↓ Download CompassTracker
                    </a>
                  </div>
                  <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                    Unzip the file — you'll get <code style={{ fontFamily: 'monospace' }}>CompassTracker.app</code>.
                    Drag it to your <strong>Applications</strong> folder.
                  </p>
                </Step>

                {/* Step 2 — Remove quarantine (the critical fix) */}
                <Step n={2} title="Remove the macOS security flag">
                  <p style={{ lineHeight: 1.5, marginBottom: 8 }}>
                    macOS marks downloaded apps as "quarantined" which causes a{' '}
                    <em>"damaged and can't be opened"</em> error for unsigned apps.
                    Run this one command in Terminal to fix it before opening:
                  </p>
                  <div style={{
                    background: 'var(--bg-base)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}>
                    <code style={{
                      flex: 1,
                      fontFamily: 'monospace',
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      userSelect: 'all',
                    }}>
                      xattr -cr /Applications/CompassTracker.app
                    </code>
                    <CopyButton value="xattr -cr /Applications/CompassTracker.app" label="Copy" />
                  </div>
                  <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                    Open <strong>Terminal</strong> (search Spotlight for "Terminal"), paste the command, press Enter.
                    You only need to do this once.
                  </p>
                </Step>

                {/* Step 3 — Open */}
                <Step n={3} title="Open the app">
                  Double-click <code style={{ fontFamily: 'monospace', fontSize: 12 }}>CompassTracker.app</code> in your Applications folder.
                  A compass icon will appear in your menu bar — that means it's running.
                </Step>

                {/* Step 4 — Permissions */}
                <Step n={4} title="Grant two permissions">
                  macOS will ask (or you'll need to grant manually):
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { name: 'Accessibility', path: 'System Settings → Privacy & Security → Accessibility', why: 'Needed to detect which app is in focus' },
                      { name: 'Automation', path: 'System Settings → Privacy & Security → Automation', why: 'Needed to read browser tab URLs' },
                    ].map(p => (
                      <li key={p.name} style={{
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 6,
                        padding: '8px 10px',
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{p.path}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic', marginTop: 1 }}>{p.why}</div>
                      </li>
                    ))}
                  </ul>
                </Step>

                {/* Step 5 — Credentials */}
                <Step n={5} title="Enter your credentials">
                  The app shows a one-time setup screen. Copy the values below and paste them in:
                </Step>
              </div>
            </Card>

            {/* Credentials */}
            <Card>
              <SectionTitle>Your credentials</SectionTitle>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16, lineHeight: 1.5 }}>
                Paste these into CompassTracker when it asks. You only do this once — they're saved securely on your Mac.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <CodeRow label="Supabase URL"  value={supabaseUrl} />
                <CodeRow label="Anon Key"      value={supabaseAnon} />
                <CodeRow label="Agent Token"   value={agentToken ?? ''} />
                <CodeRow label="User ID"       value={user?.id ?? ''} />
              </div>
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                <CopyButton
                  value={[
                    `Supabase URL:  ${supabaseUrl}`,
                    `Anon Key:      ${supabaseAnon}`,
                    `Agent Token:   ${agentToken ?? ''}`,
                    `User ID:       ${user?.id ?? ''}`,
                  ].join('\n')}
                  label="Copy all four values"
                />
              </div>
            </Card>

            {/* Troubleshooting */}
            <Card>
              <SectionTitle>Still having trouble?</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  {
                    q: '"App is damaged and can\'t be opened"',
                    a: 'Run the Terminal command in Step 2 above. This always fixes it.',
                  },
                  {
                    q: '"App can\'t be opened because Apple cannot check it"',
                    a: 'Go to System Settings → Privacy & Security → scroll down → click "Open Anyway" next to CompassTracker.',
                  },
                  {
                    q: 'No data appearing after setup',
                    a: 'Check that both Accessibility and Automation are enabled in System Settings → Privacy & Security. Quit and reopen the app after granting permissions.',
                  },
                  {
                    q: 'Browser tabs show as "Unknown"',
                    a: 'Enable Automation in System Settings → Privacy & Security → Automation → toggle on CompassTracker for Chrome/Safari.',
                  },
                  {
                    q: 'How do I quit the tracker?',
                    a: 'Click the compass icon in your menu bar → Quit.',
                  },
                ].map((item, i) => (
                  <div key={i} style={{ paddingBottom: 10, borderBottom: i < 4 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 3 }}>{item.q}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{item.a}</div>
                  </div>
                ))}
              </div>
            </Card>

          </div>
        )}

        {/* ── Team & invite tab ──────────────────────────────── */}
        {tab === 'team' && (
          <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Team info */}
            <Card>
              <SectionTitle>Your team</SectionTitle>
              {team ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3 }}>Team name</div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{team.name}</div>
                  </div>
                  <CodeRow label="Team code" value={team.team_code} />
                </div>
              ) : (
                <div className="skeleton" style={{ height: 60, borderRadius: 6 }} />
              )}
            </Card>

            {/* Invite link */}
            <Card>
              <SectionTitle>Invite a teammate</SectionTitle>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14, lineHeight: 1.6 }}>
                Share this link. When they click it, the join code is pre-filled automatically — they just create an account and they're in.
              </p>

              {team ? (
                <>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                    <div style={{
                      flex: 1,
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6,
                      padding: '8px 12px',
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      fontFamily: 'monospace',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {inviteLink}
                    </div>
                    <CopyButton value={inviteLink} label="Copy link" />
                  </div>

                  <div
                    style={{
                      padding: '10px 14px',
                      background: 'var(--accent-subtle)',
                      border: '1px solid rgba(124,111,224,0.2)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5,
                    }}
                  >
                    <strong style={{ color: 'var(--text-primary)' }}>What happens when they click it:</strong>
                    <ol style={{ margin: '6px 0 0 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <li>Sign-up page opens with "Join team" pre-selected</li>
                      <li>Team code is already filled in</li>
                      <li>They create an account and land directly in your team</li>
                    </ol>
                  </div>
                </>
              ) : (
                <div className="skeleton" style={{ height: 44, borderRadius: 6 }} />
              )}
            </Card>

            {/* After they're in */}
            <Card>
              <SectionTitle>After they've joined</SectionTitle>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
                Once they're in the app, send them to <strong>Settings → macOS Tracker</strong> to set up activity tracking on their computer.
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                They'll need the <strong>CompassTracker.app</strong> file — share it with them via Slack, email, or AirDrop.
              </p>
            </Card>
          </div>
        )}

        {/* ── Profile tab ───────────────────────────────────── */}
        {tab === 'profile' && (
          <div style={{ maxWidth: 400, color: 'var(--text-secondary)', fontSize: 13 }}>
            <p>Profile settings — Phase 8</p>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Shared layout primitives ──────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      borderRadius: 12,
      padding: '18px 20px',
    }}>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14 }}>
      {children}
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        background: 'var(--accent-subtle)',
        border: '1px solid rgba(124,111,224,0.3)',
        color: 'var(--accent)',
        fontSize: 11, fontWeight: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 1,
      }}>
        {n}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  )
}
