#!/bin/bash
# Nhost seed setup helper - creates test users and generates SQL with real IDs
# Usage: bash nhost/seeds/default/setup.sh

echo "AgentFlow Seed Setup Helper"
echo "============================"
echo ""
echo "This script will create test users in Nhost and generate seed.sql with real IDs."
echo ""
echo "Prerequisites:"
echo "  - Nhost running locally (http://localhost:1337)"
echo "  - curl installed"
echo ""

NHOST_URL="http://localhost:1337"
HASURA_URL="$NHOST_URL/graphql"

# Function to create user via Hasura mutation
create_user() {
  local email=$1
  local password=$2
  echo "Creating user: $email"
  
  # Use Nhost Auth API
  RESPONSE=$(curl -s -X POST "$NHOST_URL/auth/post/sign-up/email-password" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}")
  
  # Extract user ID from response
  USER_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  
  if [ -z "$USER_ID" ]; then
    echo "Failed to create user $email. Response: $RESPONSE"
    return 1
  fi
  
  echo "Created user $email with ID: $USER_ID"
  echo "$USER_ID"
}

echo "Step 1: Creating test users..."
echo ""

# Create users
ALICE_ID=$(create_user "alice@test.local" "password123")
BOB_ID=$(create_user "bob@test.local" "password123")
CHARLIE_ID=$(create_user "charlie@test.local" "password123")

echo ""
echo "Step 2: Generating seed.sql with real user IDs..."
echo ""

# Generate seed SQL
cat > nhost/seeds/default/seed.sql << EOF
-- Seed data for AgentFlow final scenario test
-- Creates two organizations (Org A, Org B) with users and a sample workflow

-- Insert organizations
INSERT INTO public.organizations (id, name, calls_used, calls_allowed) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Org A', 0, 1000),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 0, 1000);

-- Insert org members with real auth.users IDs
INSERT INTO public.org_members (org_id, user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', '$ALICE_ID', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '$BOB_ID', 'editor'),
  ('22222222-2222-2222-2222-222222222222', '$CHARLIE_ID', 'owner');

-- Org A: Sample workflow with llm_call, http_request, conditional_branch, approval_gate
INSERT INTO public.workflows (id, org_id, name, description, created_by, is_enabled) VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'AI Analysis Workflow', 'Analyzes input with LLM, calls API, branches on result, requires approval', '$ALICE_ID', true);

-- Workflow steps for Org A
INSERT INTO public.workflow_steps (id, workflow_id, org_id, position, type, config) VALUES
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 0, 'llm_call', '{\"prompt\": \"Is this approved? Analyze: {{context}}.\"}'),
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 1, 'http_request', '{\"url\": \"https://httpbin.org/post\", \"method\": \"POST\", \"headers\": {\"content-type\": \"application/json\"}}'),
  ('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 2, 'conditional_branch', '{\"contains\": \"approved\"}'),
  ('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 3, 'approval_gate', '{}');

-- Org A: Workflow triggers
INSERT INTO public.workflow_triggers (id, workflow_id, org_id, type, config, enabled) VALUES
  ('88888888-8888-8888-8888-888888888888', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'manual', '{}', true),
  ('99999999-9999-9999-9999-999999999999', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'webhook', '{\"secret\": \"webhook-secret-org-a\"}', true);

-- Note: Real user IDs have been populated above. You can now run tests!
EOF

echo "Seed file generated successfully!"
echo ""
echo "Test User Credentials:"
echo "  Alice (Org A Owner): alice@test.local / password123 (ID: $ALICE_ID)"
echo "  Bob (Org A Editor): bob@test.local / password123 (ID: $BOB_ID)"
echo "  Charlie (Org B Owner): charlie@test.local / password123 (ID: $CHARLIE_ID)"
echo ""
echo "Next steps:"
echo "  1. Run: nhost db seed"
echo "  2. Open: http://localhost:3000"
echo "  3. Sign in with any test user credentials above"
