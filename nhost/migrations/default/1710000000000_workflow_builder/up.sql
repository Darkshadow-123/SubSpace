CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.member_role AS ENUM ('owner', 'editor', 'viewer');
CREATE TYPE public.workflow_step_type AS ENUM ('llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate');
CREATE TYPE public.workflow_run_status AS ENUM ('queued', 'running', 'paused', 'completed', 'failed');
CREATE TYPE public.step_run_status AS ENUM ('pending', 'running', 'succeeded', 'failed', 'paused', 'skipped', 'approved');
CREATE TYPE public.workflow_trigger_type AS ENUM ('manual', 'webhook', 'scheduled', 'database_event');

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  calls_used integer NOT NULL DEFAULT 0 CHECK (calls_used >= 0),
  calls_allowed integer NOT NULL DEFAULT 1000 CHECK (calls_allowed > 0),
  quota_period_started_at timestamptz NOT NULL DEFAULT date_trunc('month', now()), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.org_members (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.member_role NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
CREATE TABLE public.workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL, description text, is_enabled boolean NOT NULL DEFAULT true,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE, position integer NOT NULL CHECK (position >= 0),
  type public.workflow_step_type NOT NULL, config jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, position)
);
CREATE TABLE public.workflow_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE, type public.workflow_trigger_type NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb, enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE, triggered_by uuid,
  trigger_type public.workflow_trigger_type NOT NULL DEFAULT 'manual', status public.workflow_run_status NOT NULL DEFAULT 'queued',
  current_position integer NOT NULL DEFAULT 0, input jsonb NOT NULL DEFAULT '{}'::jsonb, output jsonb, error text,
  started_at timestamptz, finished_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.step_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow_run_id uuid NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE RESTRICT, org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  position integer NOT NULL, status public.step_run_status NOT NULL DEFAULT 'pending', input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb, error text, attempt_count integer NOT NULL DEFAULT 0, approved_by uuid, approved_at timestamptz,
  started_at timestamptz, finished_at timestamptz, UNIQUE (workflow_run_id, position)
);
CREATE TABLE public.workflow_results (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE, workflow_run_id uuid NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.notification_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE, workflow_run_id uuid REFERENCES public.workflow_runs(id) ON DELETE CASCADE, step_position integer, payload jsonb NOT NULL, processed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.database_watch_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE, org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE, payload jsonb NOT NULL, processed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());

CREATE INDEX workflow_org_idx ON public.workflows(org_id); CREATE INDEX step_workflow_position_idx ON public.workflow_steps(workflow_id, position);
CREATE INDEX trigger_workflow_idx ON public.workflow_triggers(workflow_id); CREATE INDEX run_workflow_created_idx ON public.workflow_runs(workflow_id, created_at DESC);
CREATE INDEX step_run_run_position_idx ON public.step_runs(workflow_run_id, position); CREATE INDEX member_user_org_idx ON public.org_members(user_id, org_id);

CREATE FUNCTION public.assert_child_org() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_org uuid;
BEGIN
  IF TG_TABLE_NAME = 'workflow_steps' OR TG_TABLE_NAME = 'workflow_triggers' THEN SELECT org_id INTO parent_org FROM public.workflows WHERE id = NEW.workflow_id;
  ELSE SELECT org_id INTO parent_org FROM public.workflow_runs WHERE id = NEW.workflow_run_id; END IF;
  IF parent_org IS NULL OR parent_org <> NEW.org_id THEN RAISE EXCEPTION 'org_id must match parent organization'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_step_org BEFORE INSERT OR UPDATE ON public.workflow_steps FOR EACH ROW EXECUTE FUNCTION public.assert_child_org();
CREATE TRIGGER validate_trigger_org BEFORE INSERT OR UPDATE ON public.workflow_triggers FOR EACH ROW EXECUTE FUNCTION public.assert_child_org();
CREATE TRIGGER validate_step_run_org BEFORE INSERT OR UPDATE ON public.step_runs FOR EACH ROW EXECUTE FUNCTION public.assert_child_org();
CREATE OR REPLACE VIEW public.org_usage_this_month AS SELECT id AS org_id, calls_used, calls_allowed, GREATEST(calls_allowed-calls_used, 0) AS calls_remaining, quota_period_started_at FROM public.organizations;
