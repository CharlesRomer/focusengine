// ── Guide screen — How to use Compass ────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 12,
      padding: '28px 32px',
      marginBottom: 16,
    }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 500, color: 'var(--text-primary)' }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--text-tertiary)',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      marginTop: 20,
      marginBottom: 6,
    }}>
      {children}
    </div>
  )
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
      {children}
    </p>
  )
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <code style={{
        fontSize: 12,
        fontFamily: 'monospace',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 4,
        padding: '2px 7px',
        color: 'var(--text-secondary)',
      }}>
        {keys}
      </code>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  )
}

export function GuideScreen() {
  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: 'var(--space-8)',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 500, color: 'var(--text-primary)' }}>
            How to use Compass
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-tertiary)' }}>
            A guide for the whole team
          </p>
        </div>

        {/* Section 1 — Daily rhythm */}
        <SectionCard title="Your daily rhythm">
          <Body>
            Compass works best when you follow a simple three-part daily structure.
            Every day has a beginning, a middle, and an end.
          </Body>

          <SubHeading>Morning — Set your commitments</SubHeading>
          <Body>
            Open Compass before you start working. Add up to 5 commitments for the day —
            these are the things you intend to complete, not just tasks on a list.
            Then look at your calendar and create focus blocks around your meetings.
            This is your plan for the day.
          </Body>

          <SubHeading>During the day — Work in focus sessions</SubHeading>
          <Body>
            When you're ready to do deep work, start a focus session. Pick the block
            you planned, or create one on the spot. The session tracks what you actually
            work on. Capture anything that comes up mid-session with ⌘K — thoughts,
            tasks, distractions — without breaking your flow.
          </Body>

          <SubHeading>End of day — Close out your commitments</SubHeading>
          <Body>
            Before you finish, mark each commitment done or incomplete.
            Done requires proof — a screenshot, a link, anything real.
            This closes the loop and feeds the team's execution rate.
          </Body>
        </SectionCard>

        {/* Section 2 — Focus sessions */}
        <SectionCard title="Focus sessions">
          <Body>
            A focus session is a named block of intentional work. Start one from the
            Today screen or by clicking a calendar block. While a session is running,
            Compass tracks which apps and sites you're actually in.
          </Body>
          <Body>
            Your focus score (0–100) measures the quality of the session — how long
            you stayed on task, how many times you drifted, and whether you finished
            with an output note.
          </Body>

          <SubHeading>Score guide</SubHeading>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
            <tbody>
              {[
                ['90–100', 'Excellent — deep, uninterrupted work'],
                ['70–89',  'Good — minor distractions, strong overall'],
                ['50–69',  'Fair — noticeable drift, room to improve'],
                ['Below 50', 'Significant drift — worth reviewing'],
              ].map(([range, label]) => (
                <tr key={range} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '6px 12px 6px 0', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', width: 80 }}>
                    {range}
                  </td>
                  <td style={{ padding: '6px 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                    {label}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Body>
            <span style={{ display: 'block', marginTop: 12 }}>
              To end a session, click "End session" and write one sentence about what
              you accomplished. This note is visible to your team if you choose to share it.
            </span>
          </Body>
        </SectionCard>

        {/* Section 3 — Team calendar */}
        <SectionCard title="The team calendar">
          <Body>
            The Calendar tab shows everyone's day in columns. Your column shows
            everything — your meetings, focus blocks, and sessions. Other people's
            columns show focus blocks and busy times, but not meeting titles.
            This lets you see when your teammates are heads-down without invading
            their privacy.
          </Body>
          <Body>
            When planning your day, look at the team calendar first. Find gaps in
            everyone's schedule and use those windows for collaborative work or
            interruptions. Protect the windows where multiple people have focus
            blocks — those are the team's deep work hours.
          </Body>
        </SectionCard>

        {/* Section 4 — Team Pulse */}
        <SectionCard title="Team Pulse">
          <Body>
            Team Pulse is the shared view of what the team is doing right now and
            how the week is going.
          </Body>
          <Body>
            The status strip at the top shows each person's current state in real
            time — whether they're locked into a session, active, or offline.
            If someone is locked in, hold the Slack message and come back later.
          </Body>
          <Body>
            Below that, you can see everyone's commitments for today. This is not
            a surveillance tool — it's a shared scoreboard. Everyone sees the same
            view. Use it to spot blockers ("Dylan hasn't set commitments yet") and
            celebrate wins ("Nate completed 5/5 — great week").
          </Body>
          <Body>
            The team execution rate at the bottom is the one number that matters
            most. It tells you whether the team is doing what it said it would do.
            Aim for 70% or above.
          </Body>
        </SectionCard>

        {/* Section 5 — Reports */}
        <SectionCard title="Reading your reports">
          <Body>
            Reports answer the question: where did my time actually go?
          </Body>
          <Body>
            <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Time breakdown</strong>{' '}
            shows how your hours split across deep work, meetings, communication, and
            off-task activity. Most people are surprised by how much time goes to
            communication.
          </Body>
          <Body>
            <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Focus score trend</strong>{' '}
            shows whether your session quality is improving over time. If it's declining,
            look at the top distractions card — usually one or two apps account for
            most of the drift.
          </Body>
          <Body>
            <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Best focus windows</strong>{' '}
            shows when you do your deepest work. Use this to schedule your most demanding
            tasks during your peak hours, and put meetings in your low-focus windows.
          </Body>
          <Body>
            Admins can see the team view — the same breakdowns for every team member.
            Use it weekly, not daily. It's a coaching tool, not a monitoring tool.
          </Body>
        </SectionCard>

        {/* Section 6 — Shortcuts */}
        <SectionCard title="Shortcuts">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Navigation</div>
              <ShortcutRow keys="⌘1" label="Today" />
              <ShortcutRow keys="⌘2" label="Calendar" />
              <ShortcutRow keys="⌘3" label="Team Pulse" />
              <ShortcutRow keys="⌘4" label="Reports" />
              <ShortcutRow keys="⌘5" label="Settings" />
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 16, marginBottom: 8 }}>Focus</div>
              <ShortcutRow keys="⌘⇧F" label="Start focus session" />
              <ShortcutRow keys="⌘⇧P" label="Pause / resume" />
              <ShortcutRow keys="⌘K"  label="Quick capture" />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Calendar</div>
              <ShortcutRow keys="Click + drag" label="Create focus block" />
              <ShortcutRow keys="Click block"  label="Edit / start session" />
              <ShortcutRow keys="Drag block"   label="Move block" />
              <ShortcutRow keys="Drag edge"    label="Resize block" />
              <ShortcutRow keys="Delete"       label="Delete selected block" />
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 16, marginBottom: 8 }}>General</div>
              <ShortcutRow keys="Esc" label="Close modal / popover" />
              <ShortcutRow keys="?"   label="Show keyboard shortcuts" />
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
