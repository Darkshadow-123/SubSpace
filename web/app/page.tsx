'use client'
import { useState } from 'react'
import { getSessionRole, nhost, type UserRole } from '@/lib/nhost'
import Dashboard from './dashboard'

export default function Home() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('viewer')
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (ready) return <Dashboard role={role} />

  const handleSignIn = async () => {
    if (!email || !password) {
      setError('Please enter both email and password.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { error } = await nhost.auth.signIn({ email, password })
      if (error) {
        setError(error.message)
        return
      }

      const resolvedRole = await getSessionRole()
      setRole(resolvedRole)
      setReady(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth">
      <div className="eyebrow">⚡ AGENTFLOW CONTROL ROOM</div>
      <h1>Build & Automate AI Agents</h1>
      <p>Multi-tenant workflow engine with real-time execution streaming & role-gated approvals.</p>

      <form className="auth-form" onSubmit={(e) => { e.preventDefault(); handleSignIn(); }}>
        <div className="input-group">
          <label htmlFor="email">EMAIL ADDRESS</label>
          <div className="input-field-wrapper">
            <span className="field-icon">✉</span>
            <input
              id="email"
              placeholder="e.g. org_a_owner@example.com"
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
              autoComplete="current-password"
            />
          </div>
        </div>

        <button type="submit" className="primary auth-submit-btn" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in to Workspace →'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

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
  )
}
