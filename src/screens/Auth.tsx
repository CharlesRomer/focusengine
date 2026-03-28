import { useState, FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { toast } from '@/store/ui'

type Step = 'signin' | 'signup' | 'profile' | 'team'

interface AuthScreenProps {
  initialStep?: Step
  userId?: string // passed when resuming team setup for an existing auth'd user
}

export function AuthScreen({ initialStep = 'signin', userId }: AuthScreenProps) {
  const [searchParams] = useSearchParams()
  const joinCodeFromUrl = searchParams.get('join') ?? ''

  const [step, setStep] = useState<Step>(initialStep)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [teamChoice, setTeamChoice] = useState<'create' | 'join'>(joinCodeFromUrl ? 'join' : 'create')
  const [teamName, setTeamName] = useState('')
  const [teamCode, setTeamCode] = useState(joinCodeFromUrl)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [authUserId, setAuthUserId] = useState<string | null>(userId ?? null)

  async function handleSignIn(e: FormEvent) {
    e.preventDefault()
    setErrors({})
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setErrors({ email: error.message })
      // on success, onAuthStateChange handles the transition — no extra logic needed
    } catch (err) {
      setErrors({ email: err instanceof Error ? err.message : 'Sign in failed' })
    } finally {
      setLoading(false)
    }
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault()
    setErrors({})
    if (!email || !password) {
      setErrors({ email: 'Email and password required' })
      return
    }
    if (password.length < 8) {
      setErrors({ password: 'Password must be at least 8 characters' })
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setErrors({ email: error.message })
        return
      }
      if (data.user) {
        setAuthUserId(data.user.id)
        setStep('profile')
      }
    } catch (err) {
      setErrors({ email: err instanceof Error ? err.message : 'Sign up failed' })
    } finally {
      setLoading(false)
    }
  }

  async function handleProfile(e: FormEvent) {
    e.preventDefault()
    if (!displayName.trim()) { setErrors({ name: 'Display name required' }); return }
    if (!authUserId) return
    setLoading(true)
    try {
      const { error } = await supabase.from('users').insert({
        id: authUserId,
        display_name: displayName.trim(),
        role: 'member',
      })
      if (error) { setErrors({ name: error.message }); return }
      setStep('team')
    } catch (err) {
      setErrors({ name: err instanceof Error ? err.message : 'Failed to save profile' })
    } finally {
      setLoading(false)
    }
  }

  async function handleTeam(e: FormEvent) {
    e.preventDefault()
    if (!authUserId) return
    setErrors({})
    setLoading(true)
    try {
      if (teamChoice === 'create') {
        if (!teamName.trim()) { setErrors({ team: 'Team name required' }); return }

        const teamId = crypto.randomUUID()
        const { error: teamError } = await supabase
          .from('teams')
          .insert({ id: teamId, name: teamName.trim(), created_by: authUserId })
        if (teamError) { setErrors({ team: teamError.message }); return }

        const { error: userError } = await supabase
          .from('users')
          .update({ team_org_id: teamId, role: 'admin' })
          .eq('id', authUserId)
        if (userError) { setErrors({ team: userError.message }); return }

        toast('Team created! Welcome to Compass.', 'success')
        // onAuthStateChange will fire TOKEN_REFRESHED and re-fetch profile → app transitions
      } else {
        if (!teamCode.trim()) { setErrors({ team: 'Team code required' }); return }

        const { data: team, error: findError } = await supabase
          .from('teams')
          .select('id')
          .eq('team_code', teamCode.trim().toLowerCase())
          .single()
        if (findError || !team) { setErrors({ team: 'Team not found. Check the code and try again.' }); return }

        const { error: userError } = await supabase
          .from('users')
          .update({ team_org_id: team.id })
          .eq('id', authUserId)
        if (userError) { setErrors({ team: userError.message }); return }

        toast('Joined team! Welcome to Compass.', 'success')
      }

      // Force a profile re-fetch so App.tsx sees the updated team_org_id
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const { data: profile } = await supabase
          .from('users').select('*').eq('id', session.user.id).single()
        if (profile) {
          const { useAuthStore } = await import('@/store/auth')
          useAuthStore.getState().setUser(profile)
        }
      }
    } catch (err) {
      setErrors({ team: err instanceof Error ? err.message : 'Failed to set up team' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--bg-base)' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-10 h-10 rounded-[var(--radius-lg)] mb-3"
            style={{ background: 'var(--accent)' }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="2" fill="white"/>
              <path d="M10 2L10 5M10 15L10 18M2 10L5 10M15 10L18 10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-[var(--text-xl)] font-semibold text-[var(--text-primary)]">Compass</h1>
          <p className="text-[var(--text-sm)] text-[var(--text-secondary)] mt-1">Focus and productivity for high-output teams</p>
        </div>

        <div
          className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-xl)] p-8"
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          {step === 'signin' && (
            <form onSubmit={handleSignIn} className="flex flex-col gap-4">
              <h2 className="text-[var(--text-lg)] font-semibold text-[var(--text-primary)]">Sign in</h2>
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                error={errors.email}
                autoComplete="email"
                autoFocus
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                error={errors.password}
                autoComplete="current-password"
              />
              <Button type="submit" loading={loading} className="w-full mt-2">
                Sign in
              </Button>
              <p className="text-center text-[var(--text-sm)] text-[var(--text-secondary)]">
                No account?{' '}
                <button
                  type="button"
                  className="text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
                  onClick={() => setStep('signup')}
                >
                  Sign up
                </button>
              </p>
            </form>
          )}

          {step === 'signup' && (
            <form onSubmit={handleSignUp} className="flex flex-col gap-4">
              <h2 className="text-[var(--text-lg)] font-semibold text-[var(--text-primary)]">Create account</h2>
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                error={errors.email}
                autoFocus
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                error={errors.password}
              />
              <Button type="submit" loading={loading} className="w-full mt-2">
                Continue
              </Button>
              <p className="text-center text-[var(--text-sm)] text-[var(--text-secondary)]">
                Have an account?{' '}
                <button
                  type="button"
                  className="text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
                  onClick={() => setStep('signin')}
                >
                  Sign in
                </button>
              </p>
            </form>
          )}

          {step === 'profile' && (
            <form onSubmit={handleProfile} className="flex flex-col gap-4">
              <div>
                <h2 className="text-[var(--text-lg)] font-semibold text-[var(--text-primary)]">What's your name?</h2>
                <p className="text-[var(--text-sm)] text-[var(--text-secondary)] mt-1">This is how your teammates will see you.</p>
              </div>
              <Input
                label="Display name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Charles"
                error={errors.name}
                autoFocus
              />
              <Button type="submit" loading={loading} className="w-full mt-2">
                Continue
              </Button>
            </form>
          )}

          {step === 'team' && (
            <form onSubmit={handleTeam} className="flex flex-col gap-4">
              <div>
                <h2 className="text-[var(--text-lg)] font-semibold text-[var(--text-primary)]">
                  {joinCodeFromUrl ? "You've been invited" : 'Set up your team'}
                </h2>
                <p className="text-[var(--text-sm)] text-[var(--text-secondary)] mt-1">
                  {joinCodeFromUrl
                    ? 'Your team code is already filled in — just click Join.'
                    : 'Start a new team or join an existing one.'}
                </p>
              </div>

              {/* Invite banner */}
              {joinCodeFromUrl && (
                <div
                  className="rounded-[var(--radius-md)] px-4 py-3"
                  style={{
                    background: 'var(--accent-subtle)',
                    border: '1px solid rgba(124,111,224,0.25)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Team code <code style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{joinCodeFromUrl}</code> will be used to join your team.
                </div>
              )}

              {/* Create / Join toggle — hidden when invite link was used */}
              {!joinCodeFromUrl && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTeamChoice('create')}
                    className={`flex-1 py-2.5 px-4 rounded-[var(--radius-md)] text-[var(--text-sm)] font-medium border transition-all ${
                      teamChoice === 'create'
                        ? 'bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--accent)]'
                        : 'bg-transparent border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    Create team
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeamChoice('join')}
                    className={`flex-1 py-2.5 px-4 rounded-[var(--radius-md)] text-[var(--text-sm)] font-medium border transition-all ${
                      teamChoice === 'join'
                        ? 'bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--accent)]'
                        : 'bg-transparent border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    Join team
                  </button>
                </div>
              )}

              {teamChoice === 'create' && !joinCodeFromUrl ? (
                <Input
                  label="Team name"
                  value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                  placeholder="Goshen Design"
                  error={errors.team}
                  autoFocus
                />
              ) : (
                <Input
                  label="Team code"
                  value={teamCode}
                  onChange={e => setTeamCode(e.target.value)}
                  placeholder="abc12345"
                  error={errors.team}
                  autoFocus={!joinCodeFromUrl}
                  readOnly={!!joinCodeFromUrl}
                />
              )}

              <Button type="submit" loading={loading} className="w-full mt-2">
                {teamChoice === 'create' && !joinCodeFromUrl ? 'Create team' : 'Join team'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
