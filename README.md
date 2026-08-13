# AgentFlow — Secure Multi-Tenant Workflow Orchestration

AgentFlow is a production-ready, security-focused AI workflow builder built on Nhost, Hasura, PostgreSQL, and Next.js. It demonstrates airtight multi-tenant isolation, two-layer permission enforcement, and real-time workflow execution with live subscriptions.

**What It Does**: Users build LLM-driven workflows with steps like API calls, conditional branching, and approval gates. Workflows execute asynchronously with retry logic, pause on approval steps, and stream live progress without page refresh. Every action is scoped to the user's organization—cross-tenant data leakage is cryptographically prevented.

## Quick Start (5 minutes)

```bash
# Install dependencies
cd web && npm install && cd ..

# Start local development environment
nhost up

# In a separate terminal, start the frontend
cd web && npm run dev
# Open http://localhost:3000
```

**First time setup:**
1. Run `nhost up` and note the actual Auth URL it prints for your environment; do not assume `localhost:1337` is the Auth service in every setup.
2. Create test users in Nhost Auth using the actual URL printed by `nhost up`.
3. Configure the JWT roles in Nhost Auth so `x-hasura-allowed-roles` contains `owner`, `editor`, and `viewer`, and `x-hasura-default-role` is `viewer`.
4. Seed data: See [TESTING.md](TESTING.md) for SQL to populate test organizations and workflows, or run [nhost/seeds/default/setup.ps1](nhost/seeds/default/setup.ps1) using your actual Auth URL.
5. Log in and run the final scenario walkthrough: [TESTING.md](TESTING.md)

## Deliverables

- ✅ **Schema**: 9 tables, org_id denormalization, self-healing triggers
- ✅ **Two-Layer Permissions**:
  - Layer 1 (Hasura): Role + org_members matching, every table gated
  - Layer 2 (Engine): Membership re-validated before execution, step-level restrictions (editor cannot create db_write/notify)
- ✅ **Workflow Engine**: 6 step types (llm_call, http_request, db_write, notify, conditional_branch, approval_gate), async execution, retry logic, quota enforcement
- ✅ **Triggers**: Manual (button), webhook (secret-authenticated), scheduled (cron), database event (ready)
- ✅ **Live Subscriptions**: WebSocket GraphQL subscriptions stream step-by-step progress, pause states, and approval prompts
- ✅ **Frontend**: Auth, org selector, workflow builder, live run panel
- ✅ **Documentation**: [IMPLEMENTATION.md](IMPLEMENTATION.md) (architecture), [TESTING.md](TESTING.md) (scenario walkthrough), [writeup.md](docs/writeup.md) (design decisions)

## Architecture

### Data Model

```
organizations ──┬─→ org_members (user_id, role)
                ├─→ workflows ──┬─→ workflow_steps (type, config, position)
                │               ├─→ workflow_triggers (type, config, secret)
                │               └─→ workflow_runs ──→ step_runs (status, input, output, approved_by)
                └─→ workflow_results
```

Every child table carries `org_id` and a database trigger that validates org_id matches the parent. This prevents inconsistent rows and makes permission checks one-dimensional (just check org_id).

### Permissions (Defense in Depth)

**Layer 1 — Hasura Metadata**:
Every table has role-based access:
- **Owner**: CRUD
- **Editor**: Read + safe mutations (cannot add db_write, notify, or webhook triggers)
- **Viewer**: Read-only

Every permission includes a Hasura condition that checks:
1. `X-Hasura-User-Id` matches a `user_id` in `org_members`
2. That membership's `role` equals the target role
3. The data's `org_id` equals the member's `org_id`

**Layer 2 — Engine Validation**:
Before executing a workflow or approving a step, the engine re-queries membership (not trusting headers alone). If the user's role has changed or membership was revoked, the run stops.

### Execution Model

```
start(workflow_id) [validates membership + quota]
  → creates workflow_run
  → fire-and-forget async resume(run_id) [returns to client immediately]
  
resume(run_id) [async]
  → fetch workflow_run + workflow_steps
  → for each step:
    → create step_run (status: running)
    → if approval_gate: set status=paused, stop
    → else: execute step (llm_call, http_request, conditional_branch, db_write, notify)
      → on error: set step status=failed, set run status=failed, stop
      → on success: update context, continue
  → on completion: set run status=completed, increment org.calls_used
  
approve(run_id, position) [validates membership]
  → re-check user is owner/editor
  → update step_runs[position]: status=approved
  → resume(run_id) [continue from next step]
```

Step-by-step progress is streamed live via GraphQL subscription, so clients see pending → running → succeeded/failed/paused/approved without page refresh.

### Triggers

- **Manual**: User clicks Run button → calls triggerWorkflowRun action
- **Webhook**: POST to /webhookTrigger/{trigger-id} with secret in body → secret verified
- **Scheduled**: Cron function runs every 5 minutes, starts all enabled scheduled workflows
- **Database Event**: Hasura event trigger metadata is present and applied via `nhost up`; the watch table is separate from `workflow_runs` so it does not recurse

## Feature Highlights

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-tenant org scoping | ✅ | Enforced in Hasura + engine |
| LLM integration (Gemini) | ✅ | Falls back to stub if no API key |
| HTTP requests with retry | ✅ | 2 attempts, 400ms backoff |
| Conditional branching | ✅ | Tests context for string match |
| Approval gates | ✅ | Pauses run, only owner/editor can resume |
| Quota enforcement | ✅ | Reserved at run start with an atomic `calls_used < calls_allowed` check; not refunded if the run creation path fails |
| Live subscriptions | ✅ | WebSocket, step-by-step progress |
| Workflow builder UI | ✅ | Add/remove/reorder steps, select triggers |
| Role-based UI filtering | ✅ | Editors cannot see db_write/notify/webhook options |
| Cross-org isolation tests | ✅ | Org B user cannot see/query/trigger Org A workflows |

## Running the Final Scenario

See [TESTING.md](TESTING.md) for the complete walkthrough:

1. Create 3 test users (Org A owner, Org A editor, Org B owner)
2. Seed Org A with a 4-step workflow (llm_call → http_request → conditional_branch → approval_gate)
3. Log in as Org A owner, run workflow manually, watch it pause at approval, approve to resume
4. Log in as Org A editor, verify you cannot add db_write steps
5. Log in as Org B owner, verify you cannot see any Org A workflows
6. Trigger workflow via webhook endpoint, confirm same isolation applies

All steps take ~10 minutes total. If all pass, all requirements are met.

## Security Notes

- Membership checks happen in two places: Hasura metadata (sync request filtering) and engine (before mutation)
- Webhook triggers authenticate via per-trigger secret, not user JWT
- Approval gates block at the engine level, not the database, so async execution doesn't leave runs hanging
- Org usage quota is reserved at run start using an atomic `calls_used < calls_allowed` check, and is not refunded if the run creation path fails
- All user input (UUIDs, enums) is validated server-side

## Design Rationale

See [docs/writeup.md](docs/writeup.md) for detailed reasoning on:
- Why org_id is denormalized on child tables
- How Layer 1 and Layer 2 permissions interact
- Why approval gates pause async instead of holding a connection

## Tech Stack

- **Backend**: Nhost (PostgreSQL + Hasura) + Node.js functions
- **Frontend**: Next.js 15, React 19, TypeScript
- **LLM**: Gemini API (configurable, stubs if key missing)
- **Subscriptions**: GraphQL WebSocket (graphql-ws)
- **Auth**: Nhost Auth (JWT)

## Deployment

For production:
1. Set `GEMINI_API_KEY` in the Nhost environment and any Vercel environment used by the frontend.
2. Configure Nhost Auth JWT claims so `x-hasura-allowed-roles` includes `owner`, `editor`, and `viewer`, with `x-hasura-default-role` set to `viewer`.
3. Ensure the Nhost action handlers receive the trusted Hasura header `x-hasura-admin-secret` or a valid bearer JWT before reading `session_variables`.
4. Deploy functions to Nhost cloud.
5. Deploy the frontend to Vercel (or any Next.js host) and set the Nhost client values in the app config (for example `NEXT_PUBLIC_NHOST_SUBDOMAIN` and `NEXT_PUBLIC_NHOST_REGION`).
6. Validate the live metadata path with `nhost up` before production sign-off.

## File Structure

```
.
├── nhost/
│   ├── migrations/          # PostgreSQL schema
│   ├── metadata/            # Hasura config (permissions, actions, triggers)
│   └── seeds/               # Test data SQL
├── functions/
│   ├── _shared/             # engine.ts (core logic), hasura.ts (GraphQL client)
│   ├── triggerWorkflowRun/  # Manual start action
│   ├── approveStep/         # Approval gate handler
│   ├── webhookTrigger/      # Webhook entry point
│   └── scheduledPoll/       # Cron job for scheduled triggers
├── web/
│   ├── app/                 # Next.js pages (login, dashboard)
│   ├── components/          # RunLive (subscriptions component)
│   ├── lib/                 # GraphQL client (nhost.ts)
│   └── styles.css           # Styling
├── docs/
│   ├── writeup.md           # Design decisions
│   ├── permission-model.md  # Permission layer documentation
└── TESTING.md               # Final scenario walkthrough
```


