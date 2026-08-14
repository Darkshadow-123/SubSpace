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

      <input
        placeholder="Email address"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
      />
      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
      />

      <button className="primary" disabled={loading} onClick={handleSignIn}>
        {loading ? 'Signing in...' : 'Sign in to Workspace →'}
      </button>

      {error && <div className="error">{error}</div>}

      <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--border-subtle)', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <p style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>🔑 Quick Test Logins:</p>
        <code style={{ display: 'block', marginBottom: '4px' }}>Org A Owner: org_a_owner@example.com</code>
        <code>Org A Editor: org_a_editor@example.com</code>
      </div>
    </main>
  )
}
