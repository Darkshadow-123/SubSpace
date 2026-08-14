import { gql } from './hasura.js'

type Step = { id:string; position:number; type:string; config:Record<string,unknown> }
type Run = { id:string; org_id:string; workflow_id:string; input:Record<string,unknown>; current_position:number }
const Q = {
  workflow: `query($id:uuid!){workflows_by_pk(id:$id){id org_id is_enabled workflow_steps(order_by:{position:asc}){id position type config}}}`,
  member: `query($org:uuid!,$user:uuid!){org_members_by_pk(org_id:$org,user_id:$user){role}}`,
  createRun: `mutation($object:workflow_runs_insert_input!){insert_workflow_runs_one(object:$object){id org_id workflow_id input current_position}}`,
  updateRun: `mutation($id:uuid!,$set:workflow_runs_set_input!){update_workflow_runs_by_pk(pk_columns:{id:$id},_set:$set){id}}`,
  createStepRun: `mutation($object:step_runs_insert_input!){insert_step_runs_one(object:$object,on_conflict:{constraint:step_runs_workflow_run_id_position_key,update_columns:[status,input,started_at]}){id}}`,
  updateStepRun: `mutation($run:uuid!,$position:Int!,$set:step_runs_set_input!){update_step_runs(where:{workflow_run_id:{_eq:$run},position:{_eq:$position}},_set:$set){affected_rows}}`,
  run: `query($id:uuid!){workflow_runs_by_pk(id:$id){id org_id workflow_id input current_position status workflow{workflow_steps(order_by:{position:asc}){id position type config}}}}`,
  quota: `mutation($id:uuid!,$limit:Int!){update_organizations(where:{id:{_eq:$id},calls_used:{_lt:$limit}},_inc:{calls_used:1}){returning{calls_used calls_allowed}}}`
}
export async function canAct(workflowId:string, userId:string) {
 const data = await gql<{workflows_by_pk:{org_id:string}|null}>(Q.workflow,{id:workflowId}); if (!data.workflows_by_pk) throw new Error('Workflow not found')
 const m = await gql<{org_members_by_pk:{role:'owner'|'editor'|'viewer'}|null}>(Q.member,{org:data.workflows_by_pk.org_id,user:userId});
 if (!m.org_members_by_pk || m.org_members_by_pk.role === 'viewer') throw new Error('Only an owner or editor may run this workflow'); return data.workflows_by_pk.org_id
}
export async function start(workflowId:string, userId:string, trigger:'manual'|'webhook'|'scheduled'|'database_event'='manual', input:Record<string,unknown>={}) {
 const wf = await gql<{workflows_by_pk:{id:string;org_id:string;is_enabled:boolean;workflow_steps:Step[]}|null}>(Q.workflow,{id:workflowId}); if (!wf.workflows_by_pk?.is_enabled) throw new Error('Workflow not found or disabled')
 const member = await gql<{org_members_by_pk:{role:string}|null}>(Q.member,{org:wf.workflows_by_pk.org_id,user:userId}); if (!member.org_members_by_pk || (trigger==='manual' && member.org_members_by_pk.role==='viewer')) throw new Error('Forbidden')
 const hasSensitiveSteps = wf.workflows_by_pk.workflow_steps.some(s => ['db_write','notify','webhook'].includes(s.type)); if (hasSensitiveSteps && member.org_members_by_pk.role !== 'owner') throw new Error('Only owners may execute workflows with sensitive steps')
 const orgData = await gql<{organizations_by_pk:{calls_allowed:number}|null}>('query($id:uuid!){organizations_by_pk(id:$id){calls_allowed}}',{id:wf.workflows_by_pk.org_id}); if (!orgData.organizations_by_pk) throw new Error('Organization not found'); const limit = orgData.organizations_by_pk.calls_allowed
 const quotaResult = await gql<{update_organizations:{affected_rows:number}}>('mutation($id:uuid!,$limit:Int!){update_organizations(where:{id:{_eq:$id},calls_used:{_lt:$limit}},_inc:{calls_used:1}){affected_rows}}',{id:wf.workflows_by_pk.org_id,limit}); if(quotaResult.update_organizations.affected_rows===0) throw new Error('Organization quota exhausted')
 const created = await gql<{insert_workflow_runs_one:Run}>(Q.createRun,{object:{workflow_id:workflowId,org_id:wf.workflows_by_pk.org_id,triggered_by:userId,trigger_type:trigger,status:'running',input,started_at:new Date().toISOString()}})
 void resume(created.insert_workflow_runs_one.id); return created.insert_workflow_runs_one.id
}
export async function resume(runId:string) {
 const result = await gql<{workflow_runs_by_pk:(Run & {status:string;workflow:{workflow_steps:Step[]}})|null}>(Q.run,{id:runId}); const run=result.workflow_runs_by_pk; if(!run || run.status==='completed'||run.status==='failed') return
 const steps=run.workflow.workflow_steps; let context:Record<string,unknown>=run.input || {}
 for (const step of steps.filter(s=>s.position>=run.current_position)) {
  if(step.type==='approval_gate') {
   await gql(Q.createStepRun,{object:{workflow_run_id:run.id,step_id:step.id,org_id:run.org_id,position:step.position,status:'paused',input:context,started_at:new Date().toISOString()}})
   await gql(Q.updateRun,{id:run.id,set:{status:'paused',current_position:step.position}})
   return
  }
  await gql(Q.createStepRun,{object:{workflow_run_id:run.id,step_id:step.id,org_id:run.org_id,position:step.position,status:'running',input:context,started_at:new Date().toISOString()}})
  if(step.type==='conditional_branch') { try { const output=await execute(step,context,run); context={...context,[`step_${step.position}`]:output}; await gql(Q.updateStepRun,{run:run.id,position:step.position,set:{status:'succeeded',output,finished_at:new Date().toISOString()}}); if (output.branch === 'else') { const nextApprovalIdx = steps.findIndex(s=>s.position>step.position && s.type==='approval_gate'); const newPos = nextApprovalIdx>=0?steps[nextApprovalIdx].position:steps.length; await gql(Q.updateRun,{id:run.id,set:{current_position:newPos}}); if(newPos>=steps.length){await gql(Q.updateRun,{id:run.id,set:{status:'completed',output:context,finished_at:new Date().toISOString()}}); return} void resume(run.id); return } } catch (e) { await gql(Q.updateStepRun,{run:run.id,position:step.position,set:{status:'failed',error:e instanceof Error?e.message:'Unknown error',finished_at:new Date().toISOString()}}); await gql(Q.updateRun,{id:run.id,set:{status:'failed'}}); return } continue }
  try { const output=await execute(step,context,run); context={...context,[`step_${step.position}`]:output}; await gql(Q.updateStepRun,{run:run.id,position:step.position,set:{status:'succeeded',output,finished_at:new Date().toISOString()}}); await gql(Q.updateRun,{id:run.id,set:{current_position:step.position+1}}) }
  catch (e) { await gql(Q.updateStepRun,{run:run.id,position:step.position,set:{status:'failed',error:e instanceof Error?e.message:'Unknown error',finished_at:new Date().toISOString()}}); await gql(Q.updateRun,{id:run.id,set:{status:'failed',error:e instanceof Error?e.message:'Unknown error',finished_at:new Date().toISOString()}}); return }
 }
 await gql(Q.updateRun,{id:run.id,set:{status:'completed',output:context,finished_at:new Date().toISOString()}})
}
async function execute(step:Step, context:Record<string,unknown>, run:Run) {
 if(step.type==='llm_call') { const key=process.env.GEMINI_API_KEY; if(!key) return {stub:true,text:'LLM stub: configure GEMINI_API_KEY for a live Gemini response'}; const prompt=String(step.config.prompt||'Summarize this context: {{context}}').replace('{{context}}',JSON.stringify(context)); const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})}); if(!r.ok) throw new Error(`Gemini ${r.status}`); const d=await r.json() as any; return {text:d.candidates?.[0]?.content?.parts?.[0]?.text||''} }
 if(step.type==='http_request') { let last:Error|undefined; for(let attempt=1;attempt<=2;attempt++){try { await gql('mutation($run:uuid!,$position:Int!,$attempt:Int!){update_step_runs(where:{workflow_run_id:{_eq:$run},position:{_eq:$position}},_set:{attempt_count:$attempt}){affected_rows}}',{run:run.id,position:step.position,attempt}); const headers = (step.config.headers as Record<string, string>) || {}; const body = step.config.body; const payload = typeof body === 'string' ? body : body !== undefined ? JSON.stringify(body) : undefined; const r = await fetch(String(step.config.url),{method:String(step.config.method||'GET'),headers,body:payload && !['GET','DELETE'].includes(String(step.config.method||'GET').toUpperCase()) ? payload : undefined}); if(!r.ok) throw new Error(`HTTP ${r.status}`); return {status:r.status,body:await r.json().catch(()=>null),attempt}}catch(e){last=e as Error; await new Promise(r=>setTimeout(r,attempt*400))}} throw last }
 if(step.type==='conditional_branch') { const value=JSON.stringify(context); return {branch:value.includes(String(step.config.contains||'yes'))?'if':'else',matched:value.includes(String(step.config.contains||'yes'))} }
 if(step.type==='db_write') { await gql('mutation($object:workflow_results_insert_input!){insert_workflow_results_one(object:$object){id}}',{object:{org_id:run.org_id,workflow_run_id:run.id,payload:context}}); return {saved:true} }
 if(step.type==='notify') { const channel=String(step.config.channel||'event'); if(channel==='event') { await gql('mutation($object:notification_events_insert_input!){insert_notification_events_one(object:$object){id}}',{object:{org_id:run.org_id,workflow_run_id:run.id,step_position:step.position,payload:context,created_at:new Date().toISOString()}}); } else if(channel==='webhook'&&step.config.url) { try { await fetch(String(step.config.url),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workflow_id:run.workflow_id,step:step.position,output:context,timestamp:new Date().toISOString()})}); } catch (e) { } } return {sent:true,channel} }
 return {ok:true}
}
