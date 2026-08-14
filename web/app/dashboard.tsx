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

const QUERY = `query($user:uuid!){organizations(where:{members:{user_id:{_eq:$user}}}){id name calls_used calls_allowed members(where:{user_id:{_eq:$user}}){role} workflows(order_by:{created_at:desc}){id name description workflow_steps(order_by:{position:asc}){id position type config} workflow_triggers{id type} workflow_runs(limit:1,order_by:{created_at:desc}){id status created_at}}}}`

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
      const d = await graph<{organizations: Org[]}>(QUERY, {user: u.id}, role)
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
          <select value={org.id} onChange={e => {
            const next = orgs.find(x => x.id === e.target.value)!
            setOrg(next)
            setWorkflows((next as Org & {workflows: Workflow[]})?.workflows || [])
          }}>
            {orgs.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <div className="quota"><b>{org.calls_used}/{org.calls_allowed}</b><span> calls this month</span></div>
          <span className={`role ${role}`}>{role}</span>
          {role !== 'viewer' && <button onClick={() => setShowBuilder(!showBuilder)}>+ New workflow</button>}
        </section>
      )}

      {showBuilder && role !== 'viewer' && org && (
        <section className="builder">
          <h2>Create workflow</h2>
          {role === 'editor' && (
            <div className="role-restriction-info">
              🛡️ <b>Editor Role Active:</b> Restricted from adding sensitive steps (<code>db_write</code>, <code>notify</code>) and <code>webhook</code> triggers.
            </div>
          )}
          <input placeholder="Workflow name" value={workflowName} onChange={e => setWorkflowName(e.target.value)} />
          <div>
            <h3>Steps ({buildingSteps.length})</h3>
            {buildingSteps.map((step, i) => (
              <div key={i} className="step-item">
                <div className="step-header">
                  <span>{i + 1}. {step.type}</span>
                  <div>
                    <button type="button" onClick={() => moveStep(i, -1)}>↑</button>
                    <button type="button" onClick={() => moveStep(i, 1)}>↓</button>
                    <button type="button" onClick={() => setBuildingSteps(buildingSteps.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                </div>

                {step.type === 'llm_call' && (
                  <label>
                    Prompt
                    <textarea value={String(step.config.prompt ?? '')} onChange={e => updateStepConfig(i, 'prompt', e.target.value)} />
                  </label>
                )}

                {step.type === 'http_request' && (
                  <>
                    <label>
                      URL
                      <input value={String(step.config.url ?? '')} onChange={e => updateStepConfig(i, 'url', e.target.value)} />
                    </label>
                    <label>
                      Method
                      <select value={String(step.config.method ?? 'POST')} onChange={e => updateStepConfig(i, 'method', e.target.value)}>
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="PATCH">PATCH</option>
                        <option value="DELETE">DELETE</option>
                      </select>
                    </label>
                    <label>
                      Body
                      <textarea value={String(step.config.body ?? '')} onChange={e => updateStepConfig(i, 'body', e.target.value)} />
                    </label>
                  </>
                )}

                {step.type === 'conditional_branch' && (
                  <label>
                    Match text
                    <input value={String(step.config.contains ?? '')} onChange={e => updateStepConfig(i, 'contains', e.target.value)} />
                  </label>
                )}

                {step.type === 'approval_gate' && (
                  <label>
                    Required role
                    <select value={String(step.config.required_role ?? 'owner')} onChange={e => updateStepConfig(i, 'required_role', e.target.value)}>
                      <option value="owner">owner</option>
                      <option value="editor">editor</option>
                    </select>
                  </label>
                )}

                {step.type === 'notify' && (
                  <>
                    <label>
                      Channel
                      <select value={String(step.config.channel ?? 'event')} onChange={e => updateStepConfig(i, 'channel', e.target.value)}>
                        <option value="event">event</option>
                        <option value="webhook">webhook</option>
                      </select>
                    </label>
                    <label>
                      Webhook URL
                      <input value={String(step.config.url ?? '')} onChange={e => updateStepConfig(i, 'url', e.target.value)} />
                    </label>
                  </>
                )}
              </div>
            ))}
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
              <option value="">+ Add step...</option>
              {STEP_TYPES.filter(t => role === 'owner' || (t !== 'db_write' && t !== 'notify')).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <h3>Trigger</h3>
            <select value={triggerType} onChange={e => setTriggerType(e.target.value)}>
              {TRIGGER_TYPES.filter(t => role === 'owner' || t !== 'webhook').map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button className="primary" onClick={saveWorkflow}>Save workflow</button>
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
