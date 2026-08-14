# 🚀 Full-Stack Assignment Submission: AI Agent Workflow Builder

## 📌 Submission Information & Live Links

- **Hosted Frontend Application (Vercel)**:  
  👉 [https://sub-space-b6zyo92hn-rishis-projects-e1d0838a.vercel.app/](https://sub-space-b6zyo92hn-rishis-projects-e1d0838a.vercel.app/)

- **GitHub Repository**:  
  👉 [https://github.com/Darkshadow-123/SubSpace](https://github.com/Darkshadow-123/SubSpace)

- **Nhost Cloud GraphQL Engine**:  
  👉 `https://sdypvexmkotrgcevznhs.hasura.ap-south-1.nhost.run/v1/graphql`

- **Nhost Region**: `ap-south-1`  
- **Nhost Subdomain**: `sdypvexmkotrgcevznhs`

---

## 🔑 Test Accounts & Demo Credentials

To evaluate multi-tenant isolation, role restriction, and approval gate authorization, log in with these pre-configured test users:

| Tenant / Org | Role | Email | Password | Allowed Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| **Organization A** | **Owner** | `org_a_owner@example.com` | `password123#` | Full control; build, run, and approve all step types (`db_write`, `notify`, `approval_gate`). |
| **Organization A** | **Editor** | `org_a_editor@example.com` | `password123#` | Can build standard workflows and trigger runs; restricted from sensitive steps (`db_write`, `notify`, `webhook`). |
| **Organization B** | **Owner** | `org_b_owner@example.com` | `password123#` | Isolated workspace; Org A workflows/data are completely invisible and inaccessible. |

---

## 📝 1-Page Technical Write-up

### 1. Schema Design & Data Model Reasoning
The system separates mutable workflow definition data (`workflows`, `workflow_steps`, `workflow_triggers`) from immutable execution telemetry (`workflow_runs`, `step_runs`, `workflow_results`). 
- **JSONB Configuration**: Node configs (`config` column on `workflow_steps`) use `JSONB` to support heterogeneous step settings (`prompt` for `llm_call`, `url` & `method` for `http_request`, `channel` for `notify`) while maintaining clean schema migrations.
- **Org ID Denormalization**: `org_id` is explicitly denormalized onto every child table (`workflow_steps`, `workflow_runs`, `step_runs`). Postgres foreign-key constraints and self-healing DB triggers mandate that a child row's `org_id` matches its parent organization. This eliminates multi-table JOINs in permission filters and guarantees single-dimensional tenant evaluation.
- **Quota Aggregation**: A dedicated Postgres View `org_usage_this_month` computes real-time usage metrics per organization.

### 2. Defense-in-Depth: Two-Layer Permission Architecture
Security is enforced across two distinct, non-overlapping authorization layers:

- **Layer 1: Hasura Row-Level Security (RLS)**  
  Every database table enforces role-based permissions tied directly to the caller's JWT (`X-Hasura-User-Id`). A user claiming a role (`x-hasura-role: owner`) must possess a matching row in `org_members` where `user_id = X-Hasura-User-Id` AND `role = requested_role` AND `org_id = target_org_id`. If a user attempts to query or mutate data outside their organization or role, Hasura returns zero rows or rejects the operation at the GraphQL parser level.

- **Layer 2: Step-Level Gating & Action Handler Validation**  
  Sensitive operations that reach outside the sandbox (such as `db_write`, `notify`, `webhook` triggers, or approving an `approval_gate`) are gated in serverless Action handlers (`triggerWorkflowRun`, `approveStep`). Before performing any step execution, the Action handler independently re-queries `org_members` directly from the database using admin credentials—never trusting client headers or unvalidated payload IDs. If an `Editor` attempts to create or execute sensitive steps, the Action handler aborts execution immediately.

### 3. Approval-Gate Pause / Resume Implementation
- **Asynchronous Non-Blocking Execution**: When `triggerWorkflowRun` starts a workflow, it initializes `workflow_runs` with `status: 'running'` and kicks off an asynchronous, non-blocking execution loop (`resume()`).
- **Atomic Pause State**: On encountering an `approval_gate` step, `engine.ts` atomically inserts/upserts `step_runs` with `status: 'paused'`, updates `workflow_runs.status = 'paused'`, and halts loop processing. No long-polling connection or worker thread is held open.
- **Role-Gated Resumption (`approveStep`)**: Resuming requires calling the `approveStep(run_id, position)` Hasura Action. The handler verifies the approver is an active `Owner` or `Editor` in the run's organization, updates `step_runs.approved_by` and `approved_at`, sets `status = 'approved'`, advances the run cursor (`current_position`), and triggers a new asynchronous `resume()` invocation to complete the remaining steps.
- **Live Real-Time Streaming**: All status changes (`running` → `paused` → `approved` → `completed`) emit immediately over `graphql-ws` WebSocket subscriptions, updating the UI in real time without page refreshes.

---

## 🧪 Final Task Scenario Verification

| Test Scenario | Verification Result |
| :--- | :--- |
| **1. Multi-Tenant Setup** | Two distinct organizations (Org A and Org B) seeded with separate user roles. |
| **2. Multi-Step Execution** | Org A Owner executes a 4-step workflow (`llm_call` → `http_request` → `conditional_branch` → `approval_gate`). LLM output feeds into branch logic (`branch: else`). |
| **3. Multi-Modal Triggers** | Workflows can be triggered manually via button or externally via secret-authenticated `/webhookTrigger` endpoint. |
| **4. Approval Gate Enforcement** | Execution pauses at Step 4 (`approval_gate`). Clicking **Approve & Continue** as Owner resumes and completes the run. |
| **5. Live Subscription Streaming** | Step nodes stream live progress, JSON output accordions, pause states, and approval banners via WebSockets without page refreshes. |
| **6. Cross-Tenant Data Isolation** | Logged in as Org B Owner, Org A workflows, runs, and steps return 0 rows and are completely invisible in the dashboard. |

---

## 🛠️ Local Development Setup

```bash
# 1. Clone repository
git clone https://github.com/Darkshadow-123/SubSpace.git
cd SubSpace

# 2. Install web dependencies
cd web && npm install && cd ..

# 3. Start Nhost local backend
nhost up

# 4. Start frontend dev server
cd web && npm run dev
# Open http://localhost:3000
```
