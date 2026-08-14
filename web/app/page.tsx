'use client'
import { useState } from 'react'
import { getSessionRole, nhost, type UserRole } from '@/lib/nhost'
import Dashboard from './dashboard'

export default function Home() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('viewer')
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  if (ready) return <Dashboard role={role} />

  const handleSubmit = async () => {
    if (!email || !password) {
      setError('Please enter both email and password.')
      return
    }
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (mode === 'signup') {
        const { error } = await nhost.auth.signUp({ email, password })
        if (error) {
          setError(error.message)
          return
        }
        setSuccess('Account created successfully! Attempting automatic sign in...')
        const signInRes = await nhost.auth.signIn({ email, password })
        if (signInRes.error) {
          setSuccess('Account created! Please enter your credentials to sign in.')
          setMode('signin')
          return
        }
        const resolvedRole = await getSessionRole()
        setRole(resolvedRole)
        setReady(true)
      } else {
        const { error } = await nhost.auth.signIn({ email, password })
        if (error) {
          setError(error.message)
          return
        }
        const resolvedRole = await getSessionRole()
        setRole(resolvedRole)
        setReady(true)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page-wrapper">
      <main className="auth">
        <div className="eyebrow">⚡ AGENTFLOW CONTROL ROOM</div>
        <h1>Build & Automate AI Agents</h1>
        <p>Multi-tenant workflow engine with real-time execution streaming & role-gated approvals.</p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: 'var(--radius-md)' }}>
          <button
            type="button"
            className={mode === 'signin' ? 'primary' : 'ghost'}
            style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}
            onClick={() => { setMode('signin'); setError(''); setSuccess('') }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={mode === 'signup' ? 'primary' : 'ghost'}
            style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}
            onClick={() => { setMode('signup'); setError(''); setSuccess('') }}
          >
            Sign Up
          </button>
        </div>

        <form className="auth-form" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          <div className="input-group">
            <label htmlFor="email">EMAIL ADDRESS</label>
            <div className="input-field-wrapper">
              <span className="field-icon">✉</span>
              <input
                id="email"
                placeholder={mode === 'signin' ? 'e.g. org_a_owner@example.com' : 'e.g. user@example.com'}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="password">PASSWORD</label>
            <div className="input-field-wrapper">
              <span className="field-icon">🔒</span>
              <input
                id="password"
                placeholder="••••••••••••"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </div>
          </div>

          <button type="submit" className="primary auth-submit-btn" disabled={loading}>
            {loading
              ? (mode === 'signup' ? 'Creating Account...' : 'Signing in...')
              : (mode === 'signup' ? 'Create Account & Continue →' : 'Sign in to Workspace →')}
          </button>
        </form>

        {error && <div className="error">{error}</div>}
        {success && <div className="role-restriction-info" style={{ marginTop: '16px' }}>{success}</div>}

        <div className="test-credentials-box">
          <p className="credentials-header">🔑 Quick Test Credentials:</p>
          <div className="credential-row">
            <span>Org A Owner:</span>
            <code>org_a_owner@example.com</code>
          </div>
          <div className="credential-row">
            <span>Org A Editor:</span>
            <code>org_a_editor@example.com</code>
          </div>
          <div className="credential-row">
            <span>Org B Owner:</span>
            <code>org_b_owner@example.com</code>
          </div>
        </div>
      </main>
    </div>
  )
}
