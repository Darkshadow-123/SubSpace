'use client'
import { useEffect, useState } from 'react'
import { createClient } from 'graphql-ws'
import { nhost } from '@/lib/nhost'

type Item = {
  position: number
  status: string
  error?: string | null
  output?: Record<string, unknown> | null
}

export function RunLive({
  runId,
  canApprove,
  onApprove
}: {
  runId: string
  canApprove: boolean
  onApprove: (position: number) => Promise<void>
  role: 'owner' | 'editor' | 'viewer'
}) {
  const [items, setItems] = useState<Item[]>([])
  const [approvingPos, setApprovingPos] = useState<number | null>(null)
  const [expandedOutput, setExpandedOutput] = useState<Record<number, boolean>>({})

  useEffect(() => {
    let dispose = () => {}
    ;(async () => {
      const token = (await nhost.auth.getSession())?.accessToken
      const client = createClient({
        url: nhost.graphql.getUrl().replace(/^http/, 'ws'),
        connectionParams: { headers: { authorization: `Bearer ${token}` } }
      })
      dispose = client.subscribe(
        {
          query:
            'subscription($id:uuid!){step_runs(where:{workflow_run_id:{_eq:$id}},order_by:{position:asc}){position status error output}}',
          variables: { id: runId }
        },
        {
          next: (v) => setItems((v.data as { step_runs: Item[] }).step_runs),
          error: console.error,
          complete: () => {}
        }
      )
    })()
    return () => dispose()
  }, [runId])

  const toggleOutput = (pos: number) => {
    setExpandedOutput((prev) => ({ ...prev, [pos]: !prev[pos] }))
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
      case 'approved':
      case 'completed':
        return '✓'
      case 'running':
        return '⚙'
      case 'paused':
        return '⏸'
      case 'failed':
        return '✕'
      default:
        return '⌛'
    }
  }

  return (
    <div className="run-live-container">
      <div className="live-header-badge">
        <span className="live-pulse">●</span> LIVE EXECUTION STREAM
      </div>

      <ol className="run-timeline">
        {items.map((s) => (
          <li key={s.position} className={`step-node ${s.status}`}>
            <div className="step-node-header">
              <div className="step-node-title">
                <span className={`status-icon ${s.status}`}>{getStatusIcon(s.status)}</span>
                <b>Step {s.position + 1}</b>
              </div>
              <span className={`status ${s.status}`}>{s.status}</span>
            </div>

            {s.error && <div className="step-error-box">⚠️ {s.error}</div>}

            {s.output && (
              <div className="output-toggle-wrapper">
                <button type="button" className="ghost output-btn" onClick={() => toggleOutput(s.position)}>
                  {expandedOutput[s.position] ? 'Hide Output JSON' : 'Show Output JSON'}
                </button>
                {expandedOutput[s.position] && (
                  <pre className="output-json">{JSON.stringify(s.output, null, 2)}</pre>
                )}
              </div>
            )}

            {s.status === 'paused' && (
              <div className="approval-banner">
                <div className="approval-info">
                  <strong>⏸ Approval Gate Triggered</strong>
                  <p>Workflow execution paused. Requires owner/editor approval to proceed.</p>
                </div>
                {canApprove ? (
                  <button
                    type="button"
                    className="primary approve-btn"
                    disabled={approvingPos === s.position}
                    onClick={async () => {
                      setApprovingPos(s.position)
                      try {
                        await onApprove(s.position)
                      } finally {
                        setApprovingPos(null)
                      }
                    }}
                  >
                    {approvingPos === s.position ? 'Approving...' : 'Approve & Continue →'}
                  </button>
                ) : (
                  <div className="viewer-locked-note">🔒 Only Owner or Editor can approve steps.</div>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
