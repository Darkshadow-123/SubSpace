'use client'
import { useState } from 'react'
import { getSessionRole, nhost, type UserRole } from '@/lib/nhost'
import Dashboard from './dashboard'

export default function Home() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('viewer')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  if (ready) return <Dashboard role={role} />

  return (
    <main className="auth">
      <p className="eyebrow">AI AGENT WORKFLOW BUILDER</p>
      <h1>Build trusted agent automations.</h1>
      <p>Every workflow is scoped to its organization and streamed live.</p>

      <input placeholder="Email" onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="Password" type="password" onChange={(e) => setPassword(e.target.value)} />

      <button
        onClick={async () => {
          const { error } = await nhost.auth.signIn({ email, password })
          if (error) {
            setError(error.message)
            return
          }

          const resolvedRole = await getSessionRole()
          setRole(resolvedRole)
          setReady(true)
        }}
      >
        Sign in
      </button>

      {error && <small>{error}</small>}
    </main>
  )
}
