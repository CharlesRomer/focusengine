export function DownloadScreen() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-base)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '64px 24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 560 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="1.5" fill="white"/>
              <path d="M8 2v2.5M8 11.5V14M2 8h2.5M11.5 8H14" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Compass</span>
        </div>

        <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 600, color: 'var(--text-primary)' }}>
          Install Compass Tracker
        </h1>
        <p style={{ margin: '0 0 40px', fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          The macOS background agent that powers activity tracking.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Step 1 */}
          <StepCard n={1} title="Download CompassTracker">
            <a
              href="/CompassTracker.zip"
              download
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 20px',
                background: 'var(--accent)',
                color: '#fff',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: 'none',
                marginTop: 10,
                marginBottom: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Download CompassTracker.zip
            </a>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
              macOS 13 (Ventura) or later required
            </p>
          </StepCard>

          {/* Step 2 */}
          <StepCard n={2} title="Install">
            <ol style={{ margin: '10px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Unzip the downloaded file
              </li>
              <li style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Drag <code style={{ fontFamily: 'monospace', fontSize: 12 }}>CompassTracker.app</code> to your <strong>Applications</strong> folder
              </li>
              <li style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Open <strong>Terminal</strong> (search Spotlight for "Terminal") and run this command to remove the security flag:
                <div style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: 'var(--text-primary)',
                  userSelect: 'all',
                }}>
                  xattr -cr /Applications/CompassTracker.app
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginTop: 4 }}>
                  This fixes the "damaged and can't be opened" error for unsigned apps.
                </span>
              </li>
              <li style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Open the app — a compass icon appears in your menu bar
              </li>
              <li style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                If macOS shows "can't be opened": System Settings → Privacy & Security → click <strong>Open Anyway</strong>
              </li>
            </ol>
          </StepCard>

          {/* Step 3 */}
          <StepCard n={3} title="Connect your account">
            <ol style={{ margin: '10px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Open Compass in your browser and sign in
              </li>
              <li style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Go to <strong>Settings → macOS Tracker</strong>
              </li>
              <li style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Copy your credentials (Supabase URL, Anon Key, Agent Token, User ID)
              </li>
              <li style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Paste them into CompassTracker when prompted
              </li>
              <li style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                You should see <strong style={{ color: 'var(--success)' }}>Connected — tracking active</strong> appear in Settings → macOS Tracker
              </li>
            </ol>
          </StepCard>

          {/* System requirements */}
          <div style={{
            padding: '16px 20px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              System requirements
            </div>
            {[
              'macOS 13 Ventura or later',
              'Accessibility permission (for window title detection)',
              'Automation permission (for browser tab URLs)',
              'Runs silently in your menu bar — no window',
            ].map(req => (
              <div key={req} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-tertiary)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{req}</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}

function StepCard({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      borderRadius: 12,
      padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{
          width: 24, height: 24, borderRadius: '50%',
          background: 'var(--accent-subtle)',
          border: '1px solid rgba(124,111,224,0.3)',
          color: 'var(--accent)',
          fontSize: 12, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {n}
        </div>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{title}</span>
      </div>
      <div style={{ paddingLeft: 34 }}>
        {children}
      </div>
    </div>
  )
}
