import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Screen error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 32,
            color: 'var(--text-secondary)',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ color: 'var(--text-tertiary)' }}>
            <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M16 10v7M16 21v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
            Something went wrong loading this screen.
          </p>
          {this.state.error?.message && (
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, fontFamily: 'monospace' }}>
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 8,
              padding: '6px 16px',
              background: 'none',
              border: '1px solid var(--border-default)',
              borderRadius: 6,
              color: 'var(--text-secondary)',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
