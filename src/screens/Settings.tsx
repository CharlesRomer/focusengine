import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/auth'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { DBUser } from '@/lib/supabase'
import { toast } from '@/store/ui'
import { format } from 'date-fns'

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
  const user     = useAuthStore(s => s.user)
  const setUser  = useAuthStore(s => s.setUser)
  const signOut  = useAuthStore(s => s.signOut)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { status, lastPing } = useAgentStatus(user?.id)
  const team = useTeamData(user?.team_org_id ?? null)

  const [agentToken, setAgentToken] = useState<string | null>(null)
  const [tab, setTab]               = useState<'agent' | 'team' | 'profile'>('agent')
  const [testing, setTesting]       = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null)

  // Profile tab state
  const [displayName,      setDisplayName]      = useState(user?.display_name ?? '')
  const [savingName,       setSavingName]        = useState(false)
  const [authEmail,        setAuthEmail]         = useState('')
  const [showLeaveModal,   setShowLeaveModal]    = useState(false)
  const [leaveLoading,     setLeaveLoading]      = useState(false)
  const [gcalLoading,      setGcalLoading]       = useState(false)

  // Handle ?gcal= query param from Google OAuth callback
  useEffect(() => {
    const gcal = searchParams.get('gcal')
    if (!gcal) return
    setSearchParams({}, { replace: true })
    if (gcal === 'connected') {
      toast('Google Calendar connected', 'success')
      setTab('profile')
      // Reload user to pick up google_calendar_connected: true
      if (user) {
        supabase.from('users').select('*').eq('id', user.id).single()
          .then(({ data }) => { if (data) setUser(data as DBUser) })
      }
    } else if (gcal === 'error') {
      toast('Could not connect Google Calendar — please try again', 'error')
      setTab('profile')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch auth email on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setAuthEmail(data.user.email)
    })
  }, [])

  // Keep displayName in sync if user changes
  useEffect(() => {
    if (user?.display_name) setDisplayName(user.display_name)
  }, [user?.display_name])

  async function saveDisplayName() {
    if (!user) return
    setSavingName(true)
    const { error } = await supabase
      .from('users')
      .update({ display_name: displayName.trim() })
      .eq('id', user.id)
    setSavingName(false)
    if (error) {
      toast('Could not update name', 'error')
    } else {
      setUser({ ...user, display_name: displayName.trim() })
      toast('Name updated', 'success')
    }
  }

  async function connectGoogleCalendar() {
    setGcalLoading(true)
    const { data, error } = await supabase.functions.invoke('google-oauth-url', {
      body: { userId: user?.id },
    })
    setGcalLoading(false)
    if (error) {
      console.error('[connectGoogleCalendar] invoke error:', error)
      toast(`Could not start Google authorization: ${error.message ?? JSON.stringify(error)}`, 'error')
      return
    }
    if (!data?.url) {
      console.error('[connectGoogleCalendar] no url in response:', data)
      toast('Could not start Google authorization — no URL returned', 'error')
      return
    }
    window.location.href = data.url
  }

  async function disconnectGoogleCalendar() {
    if (!user) return
    setGcalLoading(true)
    const { error } = await supabase.from('users').update({
      google_access_token:       null,
      google_refresh_token:      null,
      google_token_expiry:       null,
      google_calendar_connected: false,
    }).eq('id', user.id)
    setGcalLoading(false)
    if (error) { toast('Could not disconnect', 'error'); return }
    setUser({ ...user, google_calendar_connected: false })
    toast('Google Calendar disconnected', 'success')
  }

  async function leaveTeam() {
    if (!user) return
    // Check if only admin
    if (user.role === 'admin') {
      const { data: admins } = await supabase
        .from('users')
        .select('id')
        .eq('team_org_id', user.team_org_id)
        .eq('role', 'admin')
      if (admins && admins.length <= 1) {
        toast("You're the only admin. Transfer admin role to another member before leaving.", 'error')
        setShowLeaveModal(false)
        return
      }
    }
    setLeaveLoading(true)
    const { error } = await supabase
      .from('users')
      .update({ team_org_id: null })
      .eq('id', user.id)
    setLeaveLoading(false)
    if (error) {
      toast('Could not leave team', 'error')
      return
    }
    setUser({ ...user, team_org_id: null })
    navigate('/')
  }

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

            {/* Share install link */}
            <Card>
              <SectionTitle>Share with teammates</SectionTitle>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14, lineHeight: 1.5 }}>
                Send this page to your teammates so they can install the tracker themselves.
              </p>
              <a
                href="/download"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 6,
                  color: 'var(--text-secondary)',
                  fontSize: 12,
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
              >
                Share install link with teammates →
              </a>
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
          <div style={{ maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Identity */}
            <Card>
              <SectionTitle>Your profile</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Display name */}
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 6 }}>
                    Display name
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 6,
                        color: 'var(--text-primary)',
                        fontSize: 13,
                        fontFamily: 'var(--font-sans)',
                        outline: 'none',
                      }}
                    />
                    {displayName.trim() !== user?.display_name && displayName.trim().length > 0 && (
                      <button
                        onClick={() => void saveDisplayName()}
                        disabled={savingName}
                        style={{
                          padding: '8px 16px',
                          background: 'var(--accent)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: savingName ? 'wait' : 'pointer',
                          fontFamily: 'var(--font-sans)',
                          flexShrink: 0,
                        }}
                      >
                        {savingName ? '...' : 'Save'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Email — read-only */}
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 6 }}>
                    Email
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginLeft: 4, verticalAlign: 'middle', opacity: 0.5 }}>
                      <rect x="1" y="4" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                      <path d="M3 4V3a2 2 0 114 0v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  </label>
                  <input
                    value={authEmail}
                    readOnly
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6,
                      color: 'var(--text-secondary)',
                      fontSize: 13,
                      fontFamily: 'var(--font-sans)',
                      opacity: 0.6,
                      cursor: 'not-allowed',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            </Card>

            {/* Team info */}
            <Card>
              <SectionTitle>Team</SectionTitle>
              {team && user ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <InfoRow label="Team name" value={team.name} />
                  <InfoRow
                    label="Your role"
                    value={
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        background: user.role === 'admin' ? 'var(--accent-subtle)' : 'var(--bg-hover)',
                        border: `1px solid ${user.role === 'admin' ? 'rgba(124,111,224,0.3)' : 'var(--border-subtle)'}`,
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 500,
                        color: user.role === 'admin' ? 'var(--accent)' : 'var(--text-secondary)',
                        textTransform: 'capitalize',
                      }}>
                        {user.role}
                      </span>
                    }
                  />
                  {user.created_at && (
                    <InfoRow
                      label="Member since"
                      value={format(new Date(user.created_at), 'MMMM yyyy')}
                    />
                  )}
                </div>
              ) : (
                <div style={{ height: 60, background: 'var(--bg-hover)', borderRadius: 6 }} />
              )}
            </Card>

            {/* Integrations */}
            <Card>
              <SectionTitle>Integrations</SectionTitle>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                {/* Left: icon + labels */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Google "G" logo */}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15.68 8.18c0-.57-.05-1.12-.14-1.64H8v3.1h4.31a3.68 3.68 0 01-1.6 2.42v2h2.58c1.51-1.39 2.39-3.44 2.39-5.88z" fill="#4285F4"/>
                    <path d="M8 16c2.16 0 3.97-.72 5.29-1.94l-2.58-2a4.8 4.8 0 01-7.15-2.52H.88v2.07A8 8 0 008 16z" fill="#34A853"/>
                    <path d="M3.56 9.54A4.83 4.83 0 013.3 8c0-.54.09-1.06.26-1.54V4.39H.88A8 8 0 000 8c0 1.29.31 2.5.88 3.61l2.68-2.07z" fill="#FBBC05"/>
                    <path d="M8 3.18c1.22 0 2.31.42 3.17 1.24l2.37-2.37A8 8 0 00.88 4.39L3.56 6.46A4.77 4.77 0 018 3.18z" fill="#EA4335"/>
                  </svg>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                      Google Calendar
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 1 }}>
                      See your meetings on the Compass calendar
                    </div>
                  </div>
                </div>

                {/* Right: connect / connected state */}
                {user?.google_calendar_connected ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Connected</span>
                    </div>
                    <button
                      onClick={() => void disconnectGoogleCalendar()}
                      disabled={gcalLoading}
                      style={{
                        padding: '4px 10px',
                        background: 'none',
                        border: '1px solid var(--border-default)',
                        borderRadius: 5,
                        color: 'var(--text-tertiary)',
                        fontSize: 12,
                        cursor: gcalLoading ? 'wait' : 'pointer',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => void connectGoogleCalendar()}
                    disabled={gcalLoading}
                    style={{
                      flexShrink: 0,
                      padding: '6px 14px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 6,
                      color: 'var(--text-secondary)',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: gcalLoading ? 'wait' : 'pointer',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {gcalLoading ? '...' : 'Connect'}
                  </button>
                )}
              </div>
            </Card>

            {/* Danger zone */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>

              <button
                onClick={() => setShowLeaveModal(true)}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  background: 'none',
                  border: '1px solid var(--danger)',
                  borderRadius: 8,
                  color: 'var(--danger)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  textAlign: 'left',
                }}
              >
                Leave team
              </button>

              <button
                onClick={() => void signOut()}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  background: 'none',
                  border: '1px solid var(--border-default)',
                  borderRadius: 8,
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  textAlign: 'left',
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        )}

        {/* ── Leave team confirmation modal ──────────────────── */}
        {showLeaveModal && (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={() => setShowLeaveModal(false)}
          >
            <div
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: 16,
                padding: 28,
                width: 400,
                maxWidth: 'calc(100vw - 32px)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                Leave {team?.name ?? 'team'}?
              </h3>
              <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                You will lose access to all team data. This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowLeaveModal(false)}
                  style={{
                    padding: '8px 16px', background: 'none',
                    border: '1px solid var(--border-default)',
                    borderRadius: 6, color: 'var(--text-secondary)',
                    fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void leaveTeam()}
                  disabled={leaveLoading}
                  style={{
                    padding: '8px 16px', background: 'var(--danger)',
                    border: 'none', borderRadius: 6, color: '#fff',
                    fontSize: 13, fontWeight: 500,
                    cursor: leaveLoading ? 'wait' : 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {leaveLoading ? '...' : 'Leave team'}
                </button>
              </div>
            </div>
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

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{value}</span>
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
