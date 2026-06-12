-- ============================================================================
-- Foundation refactor — Checkpoint B: re-model.
-- Renames the merged tables out of the way and creates the spec data model:
--   jobs        -> roles            (person-independent posting)
--   candidates  -> legacy_candidates (kept for backfill; dropped in cleanup)
-- then creates candidates(PERSON) ⟂ applications(PERSON×ROLE), rubric_versions,
-- stage_events, screen_sessions, evidence, audit_log, candidate_files, the work
-- queue `jobs`, and stub tables for later modules.
-- Postgres stores policy/FK definitions by OID, so renames carry existing
-- policies and foreign keys automatically.
-- ============================================================================

-- New enums -----------------------------------------------------------------
CREATE TYPE public.application_status AS ENUM ('active', 'rejected', 'hired', 'pooled', 'withdrawn');
CREATE TYPE public.actor_type AS ENUM ('human', 'system');
CREATE TYPE public.screen_mode AS ENUM ('chat', 'voice');
CREATE TYPE public.job_state AS ENUM ('queued', 'running', 'done', 'failed');

-- 1. jobs -> roles ----------------------------------------------------------
ALTER TABLE public.jobs RENAME TO roles;
ALTER TYPE public.job_status RENAME TO role_status;
ALTER TABLE public.roles RENAME COLUMN knockout_criteria TO knockout_rules;
ALTER TABLE public.roles ADD COLUMN org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE public.roles ADD COLUMN dept TEXT;
ALTER TABLE public.roles ADD COLUMN location TEXT;
ALTER TABLE public.roles ADD COLUMN opened_at TIMESTAMPTZ;
ALTER TABLE public.roles ADD COLUMN closed_at TIMESTAMPTZ;
UPDATE public.roles SET org_id = '00000000-0000-0000-0000-0000000000aa' WHERE org_id IS NULL;
ALTER TABLE public.roles ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX idx_roles_org ON public.roles(org_id);
CREATE INDEX idx_roles_org_status ON public.roles(org_id, status);
-- Re-scope access from per-recruiter to per-org. Keep the anon "open roles"
-- read (its OID-based policy already points at the renamed table).
DROP POLICY IF EXISTS "recruiter manages own jobs" ON public.roles;
DROP POLICY IF EXISTS "open jobs readable signed in" ON public.roles;
CREATE POLICY "org members manage roles" ON public.roles FOR ALL TO authenticated
  USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
-- competencies/screening_questions move to rubric_versions; dropped after backfill.

-- 2. candidates(merged) -> legacy_candidates --------------------------------
ALTER TABLE public.candidates RENAME TO legacy_candidates;

-- 3. candidates (PERSON, global per org) ------------------------------------
CREATE TABLE public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email CITEXT NOT NULL,
  phone TEXT,
  location TEXT,
  headline TEXT,
  years_exp NUMERIC,
  skills TEXT[] NOT NULL DEFAULT '{}',
  resume_summary TEXT,
  consent_pool BOOLEAN NOT NULL DEFAULT false,
  consent_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)   -- citext => case-insensitive dedup
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidates TO authenticated;
GRANT ALL ON public.candidates TO service_role;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members manage candidates" ON public.candidates FOR ALL TO authenticated
  USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE INDEX idx_candidates_org ON public.candidates(org_id);
CREATE INDEX idx_candidates_skills ON public.candidates USING gin (skills);

-- 4. rubric_versions (immutable after lock) ---------------------------------
CREATE TABLE public.rubric_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  version INT NOT NULL,
  competencies JSONB NOT NULL DEFAULT '[]'::jsonb,
  screening_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  knockout_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role_id, version)
);
-- Append-only for clients: SELECT + INSERT, no UPDATE/DELETE grant.
GRANT SELECT, INSERT ON public.rubric_versions TO authenticated;
GRANT ALL ON public.rubric_versions TO service_role;
ALTER TABLE public.rubric_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read rubrics" ON public.rubric_versions
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "org members insert rubrics" ON public.rubric_versions
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE INDEX idx_rubric_versions_role ON public.rubric_versions(role_id);
-- Hard immutability guard (also blocks the service role from editing a locked row).
CREATE OR REPLACE FUNCTION public.guard_locked_rubric()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'rubric_versions % is locked and cannot be modified or deleted', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_locked_rubric
  BEFORE UPDATE OR DELETE ON public.rubric_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_locked_rubric();

-- 5. applications (PERSON × ROLE) -------------------------------------------
CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  rubric_version_id UUID REFERENCES public.rubric_versions(id),
  stage public.candidate_stage NOT NULL DEFAULT 'applied',
  stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status public.application_status NOT NULL DEFAULT 'active',
  source TEXT,
  rejection_reason TEXT,
  knockout_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  needs_human_screen BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, role_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members manage applications" ON public.applications FOR ALL TO authenticated
  USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE INDEX idx_applications_role ON public.applications(role_id, stage, status, created_at DESC);
CREATE INDEX idx_applications_candidate ON public.applications(candidate_id);
CREATE INDEX idx_applications_org ON public.applications(org_id);

-- 6. stage_events (audit trail, append-only) --------------------------------
CREATE TABLE public.stage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  from_stage public.candidate_stage,
  to_stage public.candidate_stage NOT NULL,
  actor_id UUID,
  actor_type public.actor_type NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.stage_events TO authenticated;
GRANT ALL ON public.stage_events TO service_role;
ALTER TABLE public.stage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read stage_events" ON public.stage_events
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "org members insert stage_events" ON public.stage_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id) AND (actor_type = 'system' OR actor_id = auth.uid()));
CREATE INDEX idx_stage_events_application ON public.stage_events(application_id, created_at);

-- 7. screen_sessions (resumable; replaces screening_interviews) --------------
CREATE TABLE public.screen_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  application_id UUID NOT NULL UNIQUE REFERENCES public.applications(id) ON DELETE CASCADE,
  mode public.screen_mode NOT NULL DEFAULT 'chat',
  status public.screening_status NOT NULL DEFAULT 'pending',
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  completeness INT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.screen_sessions TO authenticated;
GRANT ALL ON public.screen_sessions TO service_role;
ALTER TABLE public.screen_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read screen_sessions" ON public.screen_sessions
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE INDEX idx_screen_sessions_application ON public.screen_sessions(application_id);

-- 8. evidence (versioned, append-only) --------------------------------------
CREATE TABLE public.evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  rubric_version_id UUID REFERENCES public.rubric_versions(id),
  extraction_id UUID NOT NULL DEFAULT gen_random_uuid(),  -- groups one extraction run's rows
  competency_key TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ai_screen',
  summary TEXT,
  quotes JSONB NOT NULL DEFAULT '[]'::jsonb,
  flags TEXT[] NOT NULL DEFAULT '{}',
  completeness TEXT,
  model_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.evidence TO authenticated;
GRANT ALL ON public.evidence TO service_role;
ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read evidence" ON public.evidence
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "org members insert evidence" ON public.evidence
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE INDEX idx_evidence_application ON public.evidence(application_id, created_at DESC);

-- 9. audit_log (append-only) ------------------------------------------------
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  actor UUID,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id UUID,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read audit_log" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "org members insert audit_log" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE INDEX idx_audit_log_org ON public.audit_log(org_id, created_at DESC);

-- 10. candidate_files (pointers only; bytes stay in Storage) ----------------
CREATE TABLE public.candidate_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'resume',
  storage_path TEXT NOT NULL,
  mime TEXT,
  size_bytes BIGINT,
  parsed_at TIMESTAMPTZ,
  parse_version INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_files TO authenticated;
GRANT ALL ON public.candidate_files TO service_role;
ALTER TABLE public.candidate_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members manage candidate_files" ON public.candidate_files FOR ALL TO authenticated
  USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE INDEX idx_candidate_files_candidate ON public.candidate_files(candidate_id);

-- 11. jobs — the work queue (name freed by the rename). Unused this cycle;
--     evidence extraction still runs inline. No pg_cron worker yet.
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.job_state NOT NULL DEFAULT 'queued',
  priority INT NOT NULL DEFAULT 0,
  attempts INT NOT NULL DEFAULT 0,
  run_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read jobs" ON public.jobs
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE INDEX idx_jobs_queue ON public.jobs(status, priority, run_after) WHERE status = 'queued';

-- 12. Stub tables for later modules (DDL + org RLS only) ---------------------
CREATE TABLE public.resume_parsed (
  candidate_id UUID PRIMARY KEY REFERENCES public.candidates(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  parse_version INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  rubric_version_id UUID REFERENCES public.rubric_versions(id),
  competency_key TEXT NOT NULL,
  interview_id UUID,
  scorer_id UUID,
  score INT,
  evidence_note TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  round INT,
  kit JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at TIMESTAMPTZ,
  interviewer_ids UUID[] NOT NULL DEFAULT '{}',
  calendar_event_id TEXT,
  status TEXT,
  transcript JSONB,
  recording_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
  application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  direction TEXT,
  channel TEXT,
  template_id UUID,
  subject TEXT,
  body TEXT,
  provider_id TEXT,
  thread_key TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
  trigger_stage TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  secrets_ref TEXT,
  status TEXT,
  last_sync_at TIMESTAMPTZ,
  sync_cursor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['resume_parsed','scores','interviews','messages','sequences','integrations']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY "org members manage %1$s" ON public.%1$I FOR ALL TO authenticated '
      || 'USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id))', t);
  END LOOP;
END $$;
