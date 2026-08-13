# AgentFlow Seed Setup - PowerShell version for Windows
# Creates test users in Nhost and generates seed.sql with real UUIDs
# 
# Prerequisites:
# - Nhost running locally (nhost dev)
# - PowerShell 5.1 or later (Windows default or PowerShell 7+)
# 
# Usage: powershell -ExecutionPolicy Bypass -File nhost/seeds/default/setup.ps1
#
# To use custom Nhost endpoints:
# set NHOST_AUTH_URL=http://your-auth-url
# set NHOST_GRAPHQL=http://your-graphql-url
# powershell -ExecutionPolicy Bypass -File nhost/seeds/default/setup.ps1

Write-Host "AgentFlow Seed Setup Helper`n" -ForegroundColor Cyan
Write-Host "This script will create test users in Nhost Auth and generate seed.sql with real UUIDs.`n" -ForegroundColor Yellow

# Configuration - adjust these if your Nhost instance runs on different ports
# Standard Nhost local development endpoints:
#   Auth API: http://localhost:1337 (same host as Hasura console)
#   GraphQL: http://localhost:3000/api/graphql (Next.js frontend)
if ($env:NHOST_AUTH_URL) {
    $NHOST_AUTH_URL = $env:NHOST_AUTH_URL
} else {
    $NHOST_AUTH_URL = "http://localhost:1337"
}

if ($env:NHOST_GRAPHQL) {
    $NHOST_GRAPHQL = $env:NHOST_GRAPHQL
} else {
    $NHOST_GRAPHQL = "http://localhost:3000/api/graphql"
}

Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  Auth URL: $NHOST_AUTH_URL" -ForegroundColor Gray
Write-Host "  GraphQL URL: $NHOST_GRAPHQL" -ForegroundColor Gray
Write-Host "`nTo use different endpoints, set environment variables:" -ForegroundColor Gray
Write-Host "  set NHOST_AUTH_URL=http://your-url" -ForegroundColor Gray
Write-Host "  set NHOST_GRAPHQL=http://your-graphql-url`n" -ForegroundColor Gray

# Test users to create
$testUsers = @(
    @{ email = "alice@test.local"; password = "password123"; name = "alice" }
    @{ email = "bob@test.local"; password = "password123"; name = "bob" }
    @{ email = "charlie@test.local"; password = "password123"; name = "charlie" }
)

# Function to create user via Nhost Auth
function Create-NhostUser {
    param(
        [string]$email,
        [string]$password,
        [string]$authUrl
    )
    
    Write-Host "Creating user: $email" -ForegroundColor Yellow
    
    try {
        # Try the standard Nhost Auth endpoint
        $authEndpoint = "$authUrl/auth/post/sign-up/email-password"
        Write-Host "  POST $authEndpoint" -ForegroundColor Gray
        
        $body = ConvertTo-Json @{
            email = $email
            password = $password
        }
        
        $response = Invoke-WebRequest -Uri $authEndpoint `
            -Method POST `
            -ContentType "application/json" `
            -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) `
            -ErrorAction Stop
        
        $content = $response.Content | ConvertFrom-Json
        
        # Check different response structures
        $userId = $null
        if ($null -ne $content.session -and $null -ne $content.session.user.id) {
            $userId = $content.session.user.id
        } elseif ($null -ne $content.user -and $null -ne $content.user.id) {
            $userId = $content.user.id
        } elseif ($null -ne $content.id) {
            $userId = $content.id
        }
        
        if ($userId) {
            Write-Host "  ✓ Created user with ID: $userId" -ForegroundColor Green
            return $userId
        } else {
            Write-Host "  ✗ Unexpected response structure:" -ForegroundColor Red
            Write-Host "    $($response.Content | ConvertFrom-Json | ConvertTo-Json)" -ForegroundColor Red
            return $null
        }
    } catch {
        Write-Host "  ✗ Error: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            Write-Host "  Response: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
        }
        return $null
    }
}

# Create users
Write-Host "Step 1: Creating test users...`n" -ForegroundColor Cyan
$userIds = @{}

foreach ($user in $testUsers) {
    $userId = Create-NhostUser -email $user.email -password $user.password -authUrl $NHOST_AUTH_URL
    if ($userId) {
        $userIds[$user.name] = $userId
        Start-Sleep -Milliseconds 500
    } else {
        Write-Host "  ⚠ Warning: Could not create user $($user.email)" -ForegroundColor Yellow
    }
}

if ($userIds.Count -eq 0) {
    Write-Host "`n✗ No users were created. Cannot proceed." -ForegroundColor Red
    Write-Host "`nTroubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Verify Nhost is running: nhost dev" -ForegroundColor Gray
    Write-Host "  2. Check auth service is accessible at:" -ForegroundColor Gray
    Write-Host "     $NHOST_AUTH_URL/auth/post/sign-up/email-password" -ForegroundColor Gray
    Write-Host "  3. If using custom Nhost setup, set environment variables:" -ForegroundColor Gray
    Write-Host "     set NHOST_AUTH_URL=http://your-auth-url" -ForegroundColor Gray
    Write-Host "     set NHOST_GRAPHQL=http://your-graphql-url" -ForegroundColor Gray
    Write-Host "  4. Try creating a user manually via Hasura console: $NHOST_AUTH_URL" -ForegroundColor Gray
    Write-Host "     Auth > Users > Create User" -ForegroundColor Gray
    exit 1
}

Write-Host "`n✓ Successfully created $($userIds.Count) users`n" -ForegroundColor Green

# Generate seed.sql with real IDs
Write-Host "Step 2: Generating seed.sql with real user IDs...`n" -ForegroundColor Cyan

$seedSql = @"
-- Seed data for AgentFlow final scenario test (AUTO-GENERATED)
-- Created: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
-- Users created in Nhost Auth: $NHOST_AUTH_URL

-- Insert organizations
INSERT INTO public.organizations (id, name, calls_used, calls_allowed) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Org A', 0, 1000),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 0, 1000);

-- Insert org members with real auth.users IDs
INSERT INTO public.org_members (org_id, user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', '$($userIds['alice'])', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '$($userIds['bob'])', 'editor'),
  ('22222222-2222-2222-2222-222222222222', '$($userIds['charlie'])', 'owner');

-- Org A: Sample workflow with llm_call, http_request, conditional_branch, approval_gate
INSERT INTO public.workflows (id, org_id, name, description, created_by, is_enabled) VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'AI Analysis Workflow', 'Analyzes input with LLM, calls API, branches on result, requires approval', '$($userIds['alice'])', true);

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
"@

$seedPath = "nhost/seeds/default/seed.sql"
Set-Content -Path $seedPath -Value $seedSql -Encoding UTF8
Write-Host "✓ Generated $seedPath with real user IDs`n" -ForegroundColor Green

# Try to run nhost db seed
Write-Host "Step 3: Running nhost db seed...`n" -ForegroundColor Cyan
try {
    $seedOutput = nhost db seed 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Seed completed successfully!" -ForegroundColor Green
    } else {
        Write-Host "⚠ nhost db seed returned exit code $LASTEXITCODE" -ForegroundColor Yellow
        Write-Host "Output: $seedOutput" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠ Could not run nhost db seed: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "You may need to run it manually: nhost db seed" -ForegroundColor Yellow
}

# Display results
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Setup Complete - Test User Credentials:" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

foreach ($name in @('alice', 'bob', 'charlie')) {
    if ($userIds.ContainsKey($name)) {
        $user = $testUsers | Where-Object { $_.name -eq $name } | Select-Object -First 1
        Write-Host "User: $name (ID: $($userIds[$name]))" -ForegroundColor Yellow
        Write-Host "  Email: $($user.email)" -ForegroundColor Gray
        Write-Host "  Password: $($user.password)`n" -ForegroundColor Gray
    }
}

Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Start Nhost: nhost dev" -ForegroundColor Gray
Write-Host "  2. Open: http://localhost:3000" -ForegroundColor Gray
Write-Host "  3. Sign in with any test user credentials above" -ForegroundColor Gray
Write-Host "  4. Run scenarios from TESTING_BLOCKERS.md" -ForegroundColor Gray
Write-Host "`n========================================`n" -ForegroundColor Cyan

