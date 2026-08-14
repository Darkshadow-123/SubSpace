# AgentFlow Final Scenario Testing Guide

This guide walks through the exact scenario specified in the assignment. If all steps complete successfully, all requirements are met: schema, permissions (both layers), engine logic, subscriptions, and cross-org isolation work end-to-end.

## Prerequisites

- Nhost CLI installed
- Node.js 18+
- `.env.local` in `web/` with `NEXT_PUBLIC_NHOST_SUBDOMAIN=local`
- PostgreSQL running (Nhost starts this)
- Optional: `GEMINI_API_KEY` for live LLM (otherwise uses stub)

## Phase 1: Local Setup (5 minutes)

```bash
# From repo root
nhost up

# In a new terminal, in web/
npm install
npm run dev
# App should be at http://localhost:3000
```

Nhost dashboard: http://localhost:1337

## Phase 2: Create Test Users in Nhost Auth (5 minutes)

1. Go to http://localhost:1337 → Auth
2. Create 3 users:
   - **Org A Owner**: org_a_owner@test.com / password123
   - **Org A Editor**: org_a_editor@test.com / password123
   - **Org B Owner**: org_b_owner@test.com / password123
3. Copy their UUIDs from the auth.users table:
   - Go to Database → auth → users
   - Note the `id` for each user

## Phase 3: Seed Database (3 minutes)

1. In Nhost dashboard, go to Database → SQL Editor
2. Copy-paste this SQL, **replacing the placeholder UUIDs** with real user IDs from Step 2:

```sql
-- Org A and B
INSERT INTO public.organizations (id, name, calls_used, calls_allowed) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Org A', 0, 1000),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 0, 1000);

-- Members (REPLACE: aaaaaaaa... = Org A Owner UUID, bbbbbbbb... = Org A Editor UUID, cccccccc... = Org B Owner UUID)
INSERT INTO public.org_members (org_id, user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', '[ORG_A_OWNER_UUID]', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '[ORG_A_EDITOR_UUID]', 'editor'),
  ('22222222-2222-2222-2222-222222222222', '[ORG_B_OWNER_UUID]', 'owner');

-- Org A workflow with 4 steps
INSERT INTO public.workflows (id, org_id, name, is_enabled, created_by) VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'AI Analysis Workflow', true, '[ORG_A_OWNER_UUID]');

-- Org A steps
INSERT INTO public.workflow_steps (id, workflow_id, org_id, position, type, config) VALUES
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 0, 'llm_call', '{"prompt":"Analyze: {{context}}"}'),
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 1, 'http_request', '{"url":"https://httpbin.org/post","method":"POST"}'),
  ('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 2, 'conditional_branch', '{"contains":"success"}'),
  ('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 3, 'approval_gate', '{}');

-- Org A triggers (manual + webhook)
INSERT INTO public.workflow_triggers (id, workflow_id, org_id, type, config, enabled) VALUES
  ('88888888-8888-8888-8888-888888888888', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'manual', '{}', true),
  ('99999999-9999-9999-9999-999999999999', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'webhook', '{"secret":"org-a-webhook-secret"}', true);
```

3. Execute the SQL

## Phase 4: Final Scenario (10 minutes)

### Part 1: Org A - Owner runs workflow with manual trigger

1. **Log in as Org A Owner** (org_a_owner@test.com / password123)
2. Verify you see:
   - **Org A** in the org dropdown
   - **AI Analysis Workflow** with 4 steps
   - **Triggers: manual, webhook**
3. Click **Run workflow**
4. Watch **Live run** panel:
   - Step 1 (llm_call) → running → succeeded (or stub response if no GEMINI_API_KEY)
   - Step 2 (http_request) → running → succeeded
   - Step 3 (conditional_branch) → running → succeeded (shows branch: if/else)
   - Step 4 (approval_gate) → running → **paused** ✅ (This is the critical pause)
5. See **"Approve & continue"** button
6. Click **Approve & continue** as the owner
7. Workflow should resume and mark step 4 as **approved** and complete

### Part 2: Org A - Editor can add/run safe steps (cannot add db_write/notify/webhook)

1. Still logged in as **Org A Owner**, click **+ New workflow**
2. Name it "Test Permissions"
3. Try to add steps:
   - Click "Add step..." → Select **llm_call** ✅ (succeeds)
   - Click "Add step..." → Select **http_request** ✅ (succeeds)
   - Click "Add step..." → Select **db_write** ✅ (should show in dropdown because you're owner)
4. Cancel this workflow
5. **Sign out** and **log in as Org A Editor** (org_a_editor@test.com / password123)
6. Click **+ New workflow**
7. Try to add steps:
   - Click "Add step..." → Select **llm_call** ✅ (succeeds)
   - Click "Add step..." → Select **db_write** ❌ (not in dropdown for editor) ✅
   - Click "Add step..." → Select **notify** ❌ (not in dropdown for editor) ✅

### Part 3: Cross-Org Isolation (Org B cannot see Org A)

1. Still logged in as **Org A Editor**, note the Org A workflow UUID: `33333333-3333-3333-3333-333333333333`
2. **Sign out** and **log in as Org B Owner** (org_b_owner@test.com / password123)
3. Verify:
   - **Org B** in the org dropdown
   - **No workflows** listed (empty) ✅
   - Org B has **0 workflows**
4. Try to guess Org A's workflow ID directly via GraphQL:
   - Open browser DevTools → Network tab
   - Try this query in the dashboard (or manually):
   ```graphql
   query {
     workflows_by_pk(id: "33333333-3333-3333-3333-333333333333") {
       id name
     }
   }
   ```
   - Result: **empty/null** ✅ (Hasura permission denied)
5. Try to trigger Org A's workflow:
   - Console: `await fetch('http://localhost:3010/graphql', {method: 'POST', headers: {'content-type': 'application/json', 'authorization': 'Bearer [token]', 'x-hasura-role': 'owner'}, body: JSON.stringify({query: 'mutation($id:uuid!){triggerWorkflowRun(workflow_id:$id){run_id}}', variables: {id: '33333333-3333-3333-3333-333333333333'}})})`
   - Result: **Error: Forbidden** ✅

### Part 4: Webhook trigger (optional, demonstrates non-manual start)

1. Log back in as **Org A Owner**
2. Open a terminal:
```bash
curl -X POST http://localhost:3011/webhookTrigger/99999999-9999-9999-9999-999999999999 \
  -H "Content-Type: application/json" \
  -d '{"test":"data"}'
```
3. Expected response: `{"run_id": "..."}`
4. Go back to the app, you should see a new run in the live panel
5. It will execute and pause at approval_gate
6. Approve as owner to complete

## Phase 5: Validation Checklist

If ALL of these pass, the assignment is complete:

- [ ] **Schema**: All tables exist, relationships correct, org_id denormalization works
- [ ] **Layer 1 Permissions**: Org B user queries return zero rows for Org A data
- [ ] **Layer 2 Permissions**: Editor role cannot add db_write/notify steps (rejected in UI and Hasura), webhook triggers also editor-blocked
- [ ] **Approval Gate**: Run pauses at approval_gate, resumes only after owner/editor approves
- [ ] **Live Subscriptions**: Step-by-step progress streams without page refresh, showing pending → running → succeeded/failed/paused/approved
- [ ] **Workflow Engine**: All step types execute (llm_call, http_request, conditional_branch, approval_gate, db_write, notify)
- [ ] **Triggers**: Manual trigger works, webhook trigger works
- [ ] **Cross-Org Isolation**: Org B owner cannot see, query, trigger, or approve Org A workflows

## Troubleshooting

### "Workflow not found or disabled"
- Check that `is_enabled = true` in the workflows table
- Verify user has permission in org_members

### "Only an owner or editor may run this workflow"
- Check that user exists in org_members with correct role
- Verify role is 'owner' or 'editor', not 'viewer'

### Subscriptions not working
- Check that WebSocket URL is correctly replacing http:// with ws://
- Verify bearer token is present in subscription headers
- Check browser console for GraphQL errors

### Approval step never shows
- Verify step type is exactly `approval_gate` (case-sensitive enum)
- Check that position matches the approval_gate step position
- Look at step_runs table to verify status changes to `paused`

### Editor can add db_write/notify
- This means Layer 2 frontend check is missing or Hasura permission isn't enforced
- Check workflow_steps permissions in Hasura metadata
- Verify `_nin: [db_write, notify]` condition is applied for editor role

## Notes

- The workflow engine runs `resume()` asynchronously, so the mutation returns immediately
- Live progress is streamed via GraphQL subscription on step_runs
- Approval gate pauses the run, increments org quota only on completion
- HTTP requests retry once with 400ms backoff
- If GEMINI_API_KEY is not set, llm_call returns a stub response (still succeeds)
