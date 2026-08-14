# 🛠️ Detailed Local Development Setup Guide

This guide walks you step-by-step through setting up, configuring, seeding, and running the **AI Agent Workflow Builder** on your local machine.

---

## 📋 System Prerequisites

Before starting, ensure your system has the following software installed:

- **Node.js**: `v18.0.0` or higher (Recommended: `v20.x`)
- **Docker Desktop**: Installed and running (Required for local Nhost Postgres, Hasura, & Auth containers)
- **Git**: Installed
- **Nhost CLI**: 
  - *macOS / Linux*: Installed via `curl -sL https://raw.githubusercontent.com/nhost/cli/main/get.sh | bash`
  - *Windows*: Installed via WSL2 (Windows Subsystem for Linux) or using Nhost Cloud directly.

---

## 🚀 Step-by-Step Setup

### Step 1: Clone Repository & Install Dependencies

```bash
# 1. Clone the repository
git clone https://github.com/Darkshadow-123/SubSpace.git
cd SubSpace

# 2. Install web frontend dependencies
cd web
npm install
cd ..
```

---

### Step 2: Configure Environment Variables

Create a `.env.local` file inside the `web/` directory:

```bash
# web/.env.local
NEXT_PUBLIC_NHOST_SUBDOMAIN=sdypvexmkotrgcevznhs
NEXT_PUBLIC_NHOST_REGION=ap-south-1

# Optional: Local Gemini API key
GEMINI_API_KEY=AIzaSyYourGeminiApiKeyHere
```

For local Nhost CLI development (`nhost up`), create a `.env` file at the root of the project:

```bash
# .env at project root
GEMINI_API_KEY=AIzaSyYourGeminiApiKeyHere
HASURA_GRAPHQL_ADMIN_SECRET=nhost-admin-secret
```

---

### Step 3: Start Local Nhost Backend

Launch the local Nhost development stack (PostgreSQL, Hasura Engine, Auth Service, Functions Runner):

```bash
# From the project root
nhost up
```

**Expected Terminal Output:**
- **Hasura Console**: `http://localhost:1337`
- **GraphQL Endpoint**: `http://localhost:1337/v1/graphql`
- **Auth Service**: `http://localhost:1337/v1/auth`
- **Functions Runner**: `http://localhost:3500`

---

### Step 4: Apply Database Migrations & Hasura Metadata

If migrations or metadata do not apply automatically on `nhost up`:

```bash
# Apply database schema migrations
nhost postgres migrate apply

# Apply Hasura metadata (relationships, permissions, actions)
nhost config apply
```

---

### Step 5: Seed Test Users & Organizations

#### 1. Create Nhost Auth Test Users
Open Hasura/Nhost Console at `http://localhost:1337` → **Auth** tab → **Users**, and create 3 test users:

1. **Org A Owner**: `org_a_owner@example.com` / `password123`
2. **Org A Editor**: `org_a_editor@example.com` / `password123`
3. **Org B Owner**: `org_b_owner@example.com` / `password123`

#### 2. Execute SQL Database Seed
Open **Hasura Console (`http://localhost:1337`) → Data → SQL Editor** and execute the seed SQL query:

```sql
-- 1. Insert Organizations
INSERT INTO public.organizations (id, name, calls_used, calls_allowed) VALUES
('f273a694-a7ec-44b7-a493-3b139fb622ad', 'Org A', 0, 1000),
('4e5374e9-3b42-4a12-b49b-6bf90d53a719', 'Org B', 0, 1000)
ON CONFLICT (id) DO NOTHING;

-- 2. Link Auth Users to Organization Memberships
-- (Replace the user_id values with the actual UUIDs generated in auth.users)
INSERT INTO public.org_members (org_id, user_id, role) VALUES
('f273a694-a7ec-44b7-a493-3b139fb622ad', 'YOUR_ORG_A_OWNER_UUID', 'owner'),
('f273a694-a7ec-44b7-a493-3b139fb622ad', 'YOUR_ORG_A_EDITOR_UUID', 'editor'),
('4e5374e9-3b42-4a12-b49b-6bf90d53a719', 'YOUR_ORG_B_OWNER_UUID', 'owner')
ON CONFLICT (org_id, user_id) DO NOTHING;
```

---

### Step 6: Start Frontend Development Server

In a new terminal window:

```bash
cd web
npm run dev
```

Open your browser and navigate to:  
👉 **`http://localhost:3000`**

---

## 🧪 Testing Local Webhook & Serverless Functions

### 1. Test Webhook Trigger Endpoint Manually

You can test workflow execution via external webhook without opening the UI:

```bash
curl -X POST http://localhost:3500/v1/functions/webhookTrigger \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "YOUR_WORKFLOW_UUID",
    "secret": "YOUR_WEBHOOK_SECRET",
    "payload": { "test": "data" }
  }'
```

### 2. Test Scheduled Poll Cron

```bash
curl -X POST http://localhost:3500/v1/functions/scheduledPoll \
  -H "Content-Type: application/json"
```

---

## ❓ Troubleshooting & FAQs

### Q1: `Your requested role is not in allowed roles`
- **Solution**: In Hasura Console → **Auth Settings**, verify allowed roles include `owner`, `editor`, `viewer`, `user`, `me`, `anonymous`.

### Q2: Port 3000 or 1337 is already in use
- **Solution**: Stop conflicting processes or specify custom ports in `web/package.json` (`next dev -p 3005`).

### Q3: `GEMINI_API_KEY` returning stub output
- **Solution**: Set `GEMINI_API_KEY` in `web/.env.local` or directly inside the step configuration JSON (`"apiKey": "AIzaSy..."`).

---

## 📂 Project Repository Overview

```
SubSpace/
├── nhost/
│   ├── migrations/          # PostgreSQL schema migrations
│   ├── metadata/            # Hasura metadata (table RLS, permissions, actions)
│   └── nhost.toml           # Nhost local configuration file
├── functions/
│   ├── _shared/             # Engine logic (engine.ts, hasura.ts)
│   ├── triggerWorkflowRun/  # Action handler to start runs
│   ├── approveStep/         # Action handler for approval gates
│   ├── webhookTrigger/      # Webhook entrypoint function
│   └── scheduledPoll/       # Scheduled polling cron handler
├── web/
│   ├── app/                 # Next.js pages (page.tsx, dashboard.tsx, layout.tsx)
│   ├── components/          # RunLive streaming component
│   └── styles.css           # Custom styling system
├── LOCAL_SETUP.md           # This setup guide
├── SUBMISSION.md            # Assignment submission summary
└── README.md                # Project architecture overview
```
