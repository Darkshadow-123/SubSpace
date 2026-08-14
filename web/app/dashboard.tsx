'use client'
import {useEffect, useState} from 'react'
import {graph, nhost} from '@/lib/nhost'
import {RunLive} from '@/components/RunLive'

type Step = {id: string; position: number; type: string; config: Record<string, unknown>}
type Workflow = {
  id: string; name: string; description?: string
  workflow_steps: Step[]
  workflow_triggers: {id: string; type: string}[]
  workflow_runs: {id: string; status: string; created_at: string}[]
}
type Org = {
  id: string; name: string; calls_used: number; calls_allowed: number
  members: {role: string}[]
  workflows?: Workflow[]
}

const QUERY = `query{organizations{id name calls_used calls_allowed members{role} workflows(order_by:{created_at:desc}){id name description workflow_steps(order_by:{position:asc}){id position type config} workflow_triggers{id type} workflow_runs(limit:1,order_by:{created_at:desc}){id status created_at}}}}`

const STEP_TYPES = ['llm_call', 'http_request', 'conditional_branch', 'approval_gate', 'db_write', 'notify'] as const
const TRIGGER_TYPES = ['manual', 'webhook', 'scheduled'] as const

export default function Dashboard({role}: {role: 'owner' | 'editor' | 'viewer'}) {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [org, setOrg] = useState<Org | null>(null)
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [run, setRun] = useState<string>('')
  const [message, setMessage] = useState('')
  const [showBuilder, setShowBuilder] = useState(false)
  const [buildingSteps, setBuildingSteps] = useState<Array<{type: string; config: Record<string, unknown>}>>([])
  const [triggerType, setTriggerType] = useState<string>('manual')
  const [workflowName, setWorkflowName] = useState('')

  const defaultStepConfig = (type: string): Record<string, unknown> => {
    switch (type) {
      case 'llm_call':
        return {prompt: 'Summarize this context: {{context}}'}
      case 'http_request':
        return {url: 'https://httpbin.org/post', method: 'POST', headers: {'content-type': 'application/json'}, body: '{"status":"ok"}'}
      case 'conditional_branch':
        return {contains: 'approved'}
      case 'approval_gate':
        return {required_role: 'owner'}
      case 'db_write':
        return {table: 'workflow_results'}
      case 'notify':
        return {channel: 'event', url: 'https://example.com/webhook'}
      default:
        return {}
    }
  }

  const moveStep = (index: number, direction: -1 | 1) => {
    setBuildingSteps(prev => {
      const next = [...prev]
      const swapIndex = index + direction
      if (swapIndex < 0 || swapIndex >= next.length) return prev
      ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
      return next
    })
  }

  const updateStepConfig = (index: number, key: string, value: unknown) => {
    setBuildingSteps(prev => prev.map((step, i) => i === index ? { ...step, config: { ...step.config, [key]: value } } : step))
  }

  const load = async () => {
    try {
      const u = (await nhost.auth.getSession())?.user
      if (!u) return
      const d = await graph<{organizations: Org[]}>(QUERY, {}, role)
      setOrgs(d.organizations)
      setOrg(d.organizations[0] || null)
      setWorkflows((d.organizations[0] as Org & {workflows: Workflow[]})?.workflows || [])
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => {
    load()
  }, [role])

  const trigger = async (id: string) => {
    try {
      const d = await graph<{triggerWorkflowRun: {run_id: string}}>('mutation($id:uuid!){triggerWorkflowRun(workflow_id:$id){run_id}}', {id}, role)
      setRun(d.triggerWorkflowRun.run_id)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to trigger')
    }
  }

  const saveWorkflow = async () => {
    if (!workflowName || buildingSteps.length === 0 || !org) return
    try {
      const session = await nhost.auth.getSession(); const userId = session?.user?.id; if (!userId) throw new Error('Not authenticated')
      const wfMut = `mutation($object:workflows_insert_input!){insert_workflows_one(object:$object){id}}`
      const wfRes = await graph<{insert_workflows_one:{id:string}}>(wfMut, {object: {org_id: org.id, name: workflowName, description: '', created_by: userId}}, role)
      const wfId = wfRes.insert_workflows_one.id
      const stepMut = `mutation($objects:[workflow_steps_insert_input!]!){insert_workflow_steps(objects:$objects){affected_rows}}`
      await graph(stepMut, {objects: buildingSteps.map((s, i) => ({org_id: org.id, workflow_id: wfId, position: i, type: s.type, config: s.config}))}, role)
      const trigMut = `mutation($object:workflow_triggers_insert_input!){insert_workflow_triggers_one(object:$object){id}}`
      await graph(trigMut, {object: {org_id: org.id, workflow_id: wfId, type: triggerType, enabled: true, config: triggerType === 'webhook' ? {secret: Math.random().toString(36).substring(2, 15)} : {}}}, role)
      setShowBuilder(false)
      setBuildingSteps([])
      setWorkflowName('')
      await load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to save')
    }
  }

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">AGENTFLOW</p>
          <h1>Workflow control room</h1>
        </div>
        <button className="ghost" onClick={() => nhost.auth.signOut().then(() => location.reload())}>Sign out</button>
      </header>

      {org && (
        <section className="toolbar">
          <div className="toolbar-left">
            {orgs.length > 1 ? (
              <select value={org.id} onChange={e => {
                const next = orgs.find(x => x.id === e.target.value)!
                setOrg(next)
                setWorkflows((next as Org & {workflows: Workflow[]})?.workflows || [])
              }}>
                {orgs.map(x => <option key={x.id} value={x.id}>🏢 {x.name}</option>)}
              </select>
            ) : (
              <div className="org-badge">
                <span className="org-icon">🏢</span>
                <span className="org-name">{org.name}</span>
              </div>
            )}
          </div>
          <div className="toolbar-right">
            <div className="quota"><b>{org.calls_used}/{org.calls_allowed}</b><span> calls this month</span></div>
            <span className={`role ${role}`}>{role}</span>
            {role !== 'viewer' && <button className="primary" onClick={() => setShowBuilder(!showBuilder)}>+ New workflow</button>}
          </div>
        </section>
      )}

      {showBuilder && role !== 'viewer' && org && (
        <section className="builder">
          <div className="builder-header">
            <div>
              <div className="eyebrow">🛠️ WORKFLOW STUDIO</div>
              <h2>Build Agentic Automation</h2>
            </div>
            <button type="button" className="ghost" onClick={() => setShowBuilder(false)}>✕ Close Builder</button>
          </div>

          {role === 'editor' && (
            <div className="role-restriction-info">
              🛡️ <b>Editor Role Active:</b> Restricted from adding sensitive steps (<code>db_write</code>, <code>notify</code>) and <code>webhook</code> triggers.
            </div>
          )}

          <div className="input-group" style={{ marginBottom: '24px' }}>
            <label htmlFor="wf-name">WORKFLOW NAME</label>
            <input
              id="wf-name"
              placeholder="e.g. AI Customer Support Pipeline"
              value={workflowName}
              onChange={e => setWorkflowName(e.target.value)}
            />
          </div>

          <div className="builder-steps-container">
            <div className="builder-section-title">
              <h3>⚡ Agentic Execution Chain ({buildingSteps.length} Steps)</h3>
              <p>Drag or reorder steps. Execution proceeds sequentially from top to bottom.</p>
            </div>

            {buildingSteps.map((step, i) => {
              const getStepBadge = (type: string) => {
                switch (type) {
                  case 'llm_call': return { icon: '🤖', label: 'AI Model (LLM)', cls: 'llm' }
                  case 'http_request': return { icon: '🌐', label: 'HTTP Request', cls: 'http' }
                  case 'conditional_branch': return { icon: '🔀', label: 'Conditional Branch', cls: 'branch' }
                  case 'approval_gate': return { icon: '⏸️', label: 'Approval Gate', cls: 'gate' }
                  case 'db_write': return { icon: '💾', label: 'Database Write', cls: 'db' }
                  case 'notify': return { icon: '🔔', label: 'Notification Alert', cls: 'notify' }
                  default: return { icon: '⚙️', label: type, cls: 'default' }
                }
              }
              const badge = getStepBadge(step.type)

              return (
                <div key={i} className="step-builder-node-wrapper">
                  <div className={`step-item node-card ${badge.cls}`}>
                    <div className="step-header">
                      <div className="node-title-badge">
                        <span className="node-icon">{badge.icon}</span>
                        <b>Step {i + 1}: {badge.label}</b>
                      </div>
                      <div className="node-actions">
                        <button type="button" className="ghost node-btn" disabled={i === 0} onClick={() => moveStep(i, -1)}>↑ Up</button>
                        <button type="button" className="ghost node-btn" disabled={i === buildingSteps.length - 1} onClick={() => moveStep(i, 1)}>↓ Down</button>
                        <button type="button" className="ghost node-btn delete" onClick={() => setBuildingSteps(buildingSteps.filter((_, j) => j !== i))}>✕ Remove</button>
                      </div>
                    </div>

                    <div className="node-config-fields">
                      {step.type === 'llm_call' && (
                        <div className="input-group">
                          <label>
                            PROMPT TEMPLATE <span className="label-hint">(Use {"{{context}}"} to inject context)</span>
                          </label>
                          <textarea
                            rows={3}
                            placeholder="Summarize this context: {{context}}"
                            value={String(step.config.prompt ?? 'Summarize this context: {{context}}')}
                            onChange={e => updateStepConfig(i, 'prompt', e.target.value)}
                          />
                          <p className="field-help-text">💡 <b>Suggested Prompt:</b> <code>Summarize this context: {"{{context}}"}</code> or <code>Analyze previous step response: {"{{context}}"}</code></p>
                        </div>
                      )}

                      {step.type === 'http_request' && (
                        <div className="input-grid-2">
                          <div className="input-group">
                            <label>TARGET URL</label>
                            <input
                              placeholder="https://httpbin.org/post"
                              value={String(step.config.url ?? 'https://httpbin.org/post')}
                              onChange={e => updateStepConfig(i, 'url', e.target.value)}
                            />
                          </div>
                          <div className="input-group">
                            <label>HTTP METHOD</label>
                            <select value={String(step.config.method ?? 'POST')} onChange={e => updateStepConfig(i, 'method', e.target.value)}>
                              <option value="GET">GET</option>
                              <option value="POST">POST</option>
                              <option value="PUT">PUT</option>
                              <option value="PATCH">PATCH</option>
                              <option value="DELETE">DELETE</option>
                            </select>
                          </div>
                          <div className="input-group full-width">
                            <label>
                              REQUEST BODY <span className="label-hint">(JSON payload string)</span>
                            </label>
                            <textarea
                              rows={2}
                              placeholder='{"status":"ok"}'
                              value={String(step.config.body ?? '{"status":"ok"}')}
                              onChange={e => updateStepConfig(i, 'body', e.target.value)}
                            />
                            <p className="field-help-text">💡 <b>Suggested Test URL:</b> <code>https://httpbin.org/post</code> (Retries automatically on 5xx failures)</p>
                          </div>
                        </div>
                      )}

                      {step.type === 'conditional_branch' && (
                        <div className="input-group">
                          <label>
                            MATCH TEXT <span className="label-hint">(Evaluated against upstream context string)</span>
                          </label>
                          <input
                            placeholder="approved"
                            value={String(step.config.contains ?? 'approved')}
                            onChange={e => updateStepConfig(i, 'contains', e.target.value)}
                          />
                          <p className="field-help-text">💡 <b>Suggested String:</b> <code>approved</code> or <code>ok</code> (Branches to <code>if</code> path when matched, or <code>else</code> path when missing)</p>
                        </div>
                      )}

                      {step.type === 'approval_gate' && (
                        <div className="input-group">
                          <label>REQUIRED APPROVAL ROLE</label>
                          <select value={String(step.config.required_role ?? 'owner')} onChange={e => updateStepConfig(i, 'required_role', e.target.value)}>
                            <option value="owner">Owner Only</option>
                            <option value="editor">Owner or Editor</option>
                          </select>
                          <p className="field-help-text">💡 <b>Human Gate:</b> Execution pauses until an authenticated <code>{String(step.config.required_role ?? 'owner')}</code> approves via the Live Stream UI.</p>
                        </div>
                      )}

                      {step.type === 'db_write' && (
                        <div className="input-group">
                          <label>
                            TARGET DATABASE TABLE <span className="label-hint">(Stores execution payload)</span>
                          </label>
                          <input
                            placeholder="workflow_results"
                            value={String(step.config.table ?? 'workflow_results')}
                            onChange={e => updateStepConfig(i, 'table', e.target.value)}
                          />
                          <p className="field-help-text">💡 <b>Suggested Table:</b> <code>workflow_results</code> (Persists current run payload securely with tenant <code>org_id</code>)</p>
                        </div>
                      )}

                      {step.type === 'notify' && (
                        <div className="input-grid-2">
                          <div className="input-group">
                            <label>CHANNEL TYPE</label>
                            <select value={String(step.config.channel ?? 'event')} onChange={e => updateStepConfig(i, 'channel', e.target.value)}>
                              <option value="event">In-App Event Log (notification_events)</option>
                              <option value="webhook">External Webhook Endpoint</option>
                            </select>
                          </div>
                          <div className="input-group">
                            <label>WEBHOOK URL</label>
                            <input
                              placeholder="https://example.com/webhook"
                              value={String(step.config.url ?? 'https://example.com/webhook')}
                              onChange={e => updateStepConfig(i, 'url', e.target.value)}
                            />
                          </div>
                          <div className="full-width">
                            <p className="field-help-text">💡 <b>Event Log vs Webhook:</b> <code>event</code> saves alerts to <code>notification_events</code>; <code>webhook</code> dispatches HTTP POST payloads.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {i < buildingSteps.length - 1 && (
                    <div className="flow-connector">
                      <span className="connector-arrow">↓ NEXT STEP</span>
                    </div>
                  )}
                </div>
              )
            })}

            <div className="add-step-card">
              <select onChange={e => {
                if (e.target.value) {
                  if (role === 'editor' && (e.target.value === 'db_write' || e.target.value === 'notify')) {
                    setMessage(`${role} role cannot add ${e.target.value} steps`)
                    return
                  }
                  setBuildingSteps([...buildingSteps, {type: e.target.value, config: defaultStepConfig(e.target.value)}])
                  e.target.value = ''
                }
              }}>
                <option value="">➕ Add Execution Step Node...</option>
                {STEP_TYPES.filter(t => role === 'owner' || (t !== 'db_write' && t !== 'notify')).map(t => (
                  <option key={t} value={t}>{t === 'llm_call' ? '🤖 llm_call (AI Generation)' : t === 'http_request' ? '🌐 http_request (External API)' : t === 'conditional_branch' ? '🔀 conditional_branch (If/Else)' : t === 'approval_gate' ? '⏸️ approval_gate (Human Gate)' : t === 'db_write' ? '💾 db_write (Database Save)' : '🔔 notify (Notification)'}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="trigger-card-section" style={{ marginTop: '32px' }}>
            <div className="builder-section-title">
              <h3>⚡ Trigger Mechanism</h3>
            </div>
            <div className="trigger-options-grid">
              <label className={`trigger-option-card ${triggerType === 'manual' ? 'active' : ''}`}>
                <input type="radio" name="trigger" value="manual" checked={triggerType === 'manual'} onChange={e => setTriggerType(e.target.value)} />
                <div>
                  <strong>▶ Manual Trigger</strong>
                  <p>Execute on demand via UI button</p>
                </div>
              </label>
              <label className={`trigger-option-card ${triggerType === 'webhook' ? 'active' : ''} ${role === 'editor' ? 'disabled' : ''}`}>
                <input type="radio" name="trigger" value="webhook" disabled={role === 'editor'} checked={triggerType === 'webhook'} onChange={e => setTriggerType(e.target.value)} />
                <div>
                  <strong>🪝 Webhook Endpoint</strong>
                  <p>Trigger via external POST endpoint</p>
                </div>
              </label>
              <label className={`trigger-option-card ${triggerType === 'scheduled' ? 'active' : ''}`}>
                <input type="radio" name="trigger" value="scheduled" checked={triggerType === 'scheduled'} onChange={e => setTriggerType(e.target.value)} />
                <div>
                  <strong>⏰ Scheduled Cron</strong>
                  <p>Automated 5-minute background polling</p>
                </div>
              </label>
            </div>
          </div>

          <div className="builder-actions-bar" style={{ marginTop: '32px', display: 'flex', gap: '12px' }}>
            <button className="primary" onClick={async () => {
              if (!workflowName) {
                setMessage('Please specify a workflow name.')
                return
              }
              if (buildingSteps.length === 0) {
                setMessage('Please add at least one step node.')
                return
              }
              const created = await graph<{insert_workflows_one: {id: string}}>(
                `mutation($org:uuid!,$name:String!,$steps:[workflow_steps_insert_input!]!,$triggers:[workflow_triggers_insert_input!]!){insert_workflows_one(object:{org_id:$org,name:$name,workflow_steps:{data:$steps},workflow_triggers:{data:$triggers}}){id}}`,
                {
                  org: org.id,
                  name: workflowName,
                  steps: buildingSteps.map((s, i) => ({position: i, type: s.type, config: s.config, org_id: org.id})),
                  triggers: [{type: triggerType, org_id: org.id}]
                },
                role
              )
              setMessage(`Workflow created: ${created.insert_workflows_one.id}`)
              setShowBuilder(false)
              setWorkflowName('')
              setBuildingSteps([])
              await load()
            }}>
              🚀 Save & Deploy Workflow
            </button>
            <button className="ghost" onClick={() => setShowBuilder(false)}>Cancel</button>
          </div>
        </section>
      )}

      {workflows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔒</div>
          <h3>No Workflows in {org?.name || 'this Organization'}</h3>
          <p>Multi-tenant organization data is strictly isolated. Workflows created in other organizations cannot be accessed.</p>
          {role !== 'viewer' && (
            <button className="primary" onClick={() => setShowBuilder(true)}>+ Create First Workflow</button>
          )}
        </div>
      ) : (
        <section className="grid">
          {workflows.map(w => (
            <article key={w.id}>
              <div>
                <div className="card-header">
                  <h2>{w.name}</h2>
                  <span className={`status ${w.workflow_runs[0]?.status || 'pending'}`}>
                    {w.workflow_runs[0]?.status || 'ready'}
                  </span>
                </div>
                <p>{w.description || 'No description'}</p>
                <div className="chips">
                  {w.workflow_steps.map(s => <span key={s.id}>{s.position + 1}. {s.type}</span>)}
                </div>
                <p className="muted">⚡ Triggers: {w.workflow_triggers.map(t => t.type).join(', ') || 'manual'}</p>
              </div>
              {role !== 'viewer' && (
                <button className="primary" onClick={() => trigger(w.id).catch(e => setMessage(e.message))}>
                  ▶ Run Workflow
                </button>
              )}
            </article>
          ))}
        </section>
      )}

      {run && (
        <section className="live">
          <div className="live-panel-header">
            <h2>Live Run Dashboard</h2>
            <button className="ghost" onClick={() => setRun('')}>✕ Close Panel</button>
          </div>
          <RunLive
            runId={run}
            canApprove={role !== 'viewer'}
            role={role}
            onApprove={async position => {
              try {
                await graph(
                  'mutation($run:uuid!,$p:Int!){approveStep(workflow_run_id:$run,position:$p){run_id}}',
                  {run, p: position},
                  role
                )
              } catch (e) {
                setMessage(e instanceof Error ? e.message : 'Failed to approve')
              }
            }}
          />
        </section>
      )}

      {message && <div className="error">{message}</div>}
    </main>
  )
}
