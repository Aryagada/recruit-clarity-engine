CREATE EXTENSION IF NOT EXISTS citext;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'org_member_role') THEN
    CREATE TYPE public.org_member_role AS ENUM ('owner', 'admin', 'recruiter', 'hm', 'interviewer', 'viewer');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'application_status') THEN
    CREATE TYPE public.application_status AS ENUM ('active', 'rejected', 'hired', 'pooled', 'withdrawn');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'actor_type') THEN
    CREATE TYPE public.actor_type AS ENUM ('human', 'system');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'screen_mode') THEN
    CREATE TYPE public.screen_mode AS ENUM ('chat', 'voice');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'job_state') THEN
    CREATE TYPE public.job_state AS ENUM ('queued', 'running', 'done', 'failed');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'job_status')
     AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'role_status') THEN
    ALTER TYPE public.job_status RENAME TO role_status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'role_status') THEN
    CREATE TYPE public.role_status AS ENUM ('draft', 'open', 'closed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  retention_months INT NOT NULL DEFAULT 24,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.orgs TO authenticated;
GRANT ALL ON public.orgs TO service_role;
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.org_member_role NOT NULL DEFAULT 'recruiter',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
GRANT SELECT ON public.org_members TO authenticated;
GRANT ALL ON public.org_members TO service_role;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own memberships" ON public.org_members;
CREATE POLICY "read own memberships" ON public.org_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.org_members(user_id);

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.org_members WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.org_members WHERE user_id = auth.uid() AND org_id = _org)
$$;

REVOKE EXECUTE ON FUNCTION public.current_org_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "members read their org" ON public.orgs;
CREATE POLICY "members read their org" ON public.orgs
  FOR SELECT TO authenticated USING (public.is_org_member(id));

INSERT INTO public.orgs (id, name)
VALUES ('00000000-0000-0000-0000-0000000000aa', 'Default Org')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (org_id, user_id, role)
SELECT '00000000-0000-0000-0000-0000000000aa', ur.user_id,
       CASE WHEN ur.role::text = 'admin' THEN 'admin'::public.org_member_role ELSE 'recruiter'::public.org_member_role END
FROM public.user_roles ur
ON CONFLICT (org_id, user_id) DO NOTHING;

DO $$
BEGIN
  IF to_regclass('public.roles') IS NULL
     AND to_regclass('public.jobs') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='jobs' AND column_name='knockout_criteria') THEN
    ALTER TABLE public.jobs RENAME TO roles;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status public.role_status NOT NULL DEFAULT 'draft',
  knockout_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  dept TEXT,
  location TEXT,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO authenticated;
GRANT SELECT ON public.roles TO anon;
GRANT ALL ON public.roles TO service_role;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='roles' AND column_name='knockout_criteria')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='roles' AND column_name='knockout_rules') THEN
    ALTER TABLE public.roles RENAME COLUMN knockout_criteria TO knockout_rules;
  END IF;
END $$;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS dept TEXT;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS knockout_rules JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE public.roles SET org_id = '00000000-0000-0000-0000-0000000000aa' WHERE org_id IS NULL;
ALTER TABLE public.roles ALTER COLUMN org_id SET NOT NULL;
DROP POLICY IF EXISTS "recruiter manages own jobs" ON public.roles;
DROP POLICY IF EXISTS "open jobs publicly readable" ON public.roles;
DROP POLICY IF EXISTS "open jobs readable signed in" ON public.roles;
DROP POLICY IF EXISTS "org members manage roles" ON public.roles;
DROP POLICY IF EXISTS "public reads open roles" ON public.roles;
CREATE POLICY "org members manage roles" ON public.roles FOR ALL TO authenticated
  USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "public reads open roles" ON public.roles FOR SELECT TO anon USING (status = 'open');
CREATE INDEX IF NOT EXISTS idx_roles_org ON public.roles(org_id);
CREATE INDEX IF NOT EXISTS idx_roles_org_status ON public.roles(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_roles_public_open ON public.roles(status) WHERE status = 'open';

DO $$
BEGIN
  IF to_regclass('public.legacy_candidates') IS NULL
     AND to_regclass('public.candidates') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='candidates' AND column_name='job_id') THEN
    ALTER TABLE public.candidates RENAME TO legacy_candidates;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.candidates (
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
  UNIQUE (org_id, email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidates TO authenticated;
GRANT ALL ON public.candidates TO service_role;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org members manage candidates" ON public.candidates;
CREATE POLICY "org members manage candidates" ON public.candidates FOR ALL TO authenticated
  USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE INDEX IF NOT EXISTS idx_candidates_org ON public.candidates(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_skills ON public.candidates USING gin (skills);

CREATE TABLE IF NOT EXISTS public.rubric_versions (
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
GRANT SELECT, INSERT ON public.rubric_versions TO authenticated;
GRANT ALL ON public.rubric_versions TO service_role;
ALTER TABLE public.rubric_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org members read rubrics" ON public.rubric_versions;
DROP POLICY IF EXISTS "org members insert rubrics" ON public.rubric_versions;
CREATE POLICY "org members read rubrics" ON public.rubric_versions
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "org members insert rubrics" ON public.rubric_versions
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE INDEX IF NOT EXISTS idx_rubric_versions_role ON public.rubric_versions(role_id, version DESC);

CREATE OR REPLACE FUNCTION public.guard_locked_rubric()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'rubric_versions % is locked and cannot be modified or deleted', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_locked_rubric ON public.rubric_versions;
CREATE TRIGGER trg_guard_locked_rubric
  BEFORE UPDATE OR DELETE ON public.rubric_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_locked_rubric();

CREATE TABLE IF NOT EXISTS public.applications (
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
DROP POLICY IF EXISTS "org members manage applications" ON public.applications;
CREATE POLICY "org members manage applications" ON public.applications FOR ALL TO authenticated
  USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE INDEX IF NOT EXISTS idx_applications_role ON public.applications(role_id, stage, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_candidate ON public.applications(candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_org ON public.applications(org_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.stage_events (
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
DROP POLICY IF EXISTS "org members read stage_events" ON public.stage_events;
DROP POLICY IF EXISTS "org members insert stage_events" ON public.stage_events;
CREATE POLICY "org members read stage_events" ON public.stage_events
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "org members insert stage_events" ON public.stage_events
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id) AND (actor_type = 'system' OR actor_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_stage_events_application ON public.stage_events(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stage_events_org ON public.stage_events(org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.screen_sessions (
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
DROP POLICY IF EXISTS "org members read screen_sessions" ON public.screen_sessions;
CREATE POLICY "org members read screen_sessions" ON public.screen_sessions
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE INDEX IF NOT EXISTS idx_screen_sessions_application ON public.screen_sessions(application_id);
CREATE INDEX IF NOT EXISTS idx_screen_sessions_org_status ON public.screen_sessions(org_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  rubric_version_id UUID REFERENCES public.rubric_versions(id),
  extraction_id UUID NOT NULL DEFAULT gen_random_uuid(),
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
DROP POLICY IF EXISTS "org members read evidence" ON public.evidence;
DROP POLICY IF EXISTS "org members insert evidence" ON public.evidence;
CREATE POLICY "org members read evidence" ON public.evidence
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "org members insert evidence" ON public.evidence
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE INDEX IF NOT EXISTS idx_evidence_application ON public.evidence(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_extraction ON public.evidence(extraction_id);
CREATE INDEX IF NOT EXISTS idx_evidence_competency ON public.evidence(rubric_version_id, competency_key, created_at DESC);

CREATE TABLE IF NOT EXISTS public.audit_log (
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
DROP POLICY IF EXISTS "org members read audit_log" ON public.audit_log;
DROP POLICY IF EXISTS "org members insert audit_log" ON public.audit_log;
CREATE POLICY "org members read audit_log" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "org members insert audit_log" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE INDEX IF NOT EXISTS idx_audit_log_org ON public.audit_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log(entity, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.candidate_files (
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (storage_path)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_files TO authenticated;
GRANT ALL ON public.candidate_files TO service_role;
ALTER TABLE public.candidate_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org members manage candidate_files" ON public.candidate_files;
CREATE POLICY "org members manage candidate_files" ON public.candidate_files FOR ALL TO authenticated
  USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE INDEX IF NOT EXISTS idx_candidate_files_candidate ON public.candidate_files(candidate_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidate_files_application ON public.candidate_files(application_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidate_files_org ON public.candidate_files(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidate_files_parse_queue ON public.candidate_files(org_id, created_at) WHERE parsed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.jobs (
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
DROP POLICY IF EXISTS "org members read jobs" ON public.jobs;
CREATE POLICY "org members read jobs" ON public.jobs
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE INDEX IF NOT EXISTS idx_jobs_queue ON public.jobs(status, priority DESC, run_after) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_jobs_org_status ON public.jobs(org_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_jobs_touch_updated_at ON public.jobs;
CREATE TRIGGER trg_jobs_touch_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DO $$
BEGIN
  IF to_regclass('public.roles') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='roles' AND column_name='competencies') THEN
      EXECUTE 'INSERT INTO public.rubric_versions (org_id, role_id, version, competencies, screening_questions, knockout_rules, locked_at, locked_by, created_at)
        SELECT r.org_id, r.id, 1, r.competencies, r.screening_questions, r.knockout_rules, now(), r.recruiter_id, r.created_at
        FROM public.roles r
        ON CONFLICT (role_id, version) DO NOTHING';
    ELSE
      INSERT INTO public.rubric_versions (org_id, role_id, version, knockout_rules, locked_at, locked_by, created_at)
      SELECT r.org_id, r.id, 1, r.knockout_rules, now(), r.recruiter_id, r.created_at
      FROM public.roles r
      ON CONFLICT (role_id, version) DO NOTHING;
    END IF;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.legacy_candidates ADD COLUMN IF NOT EXISTS resume_path TEXT;
DO $$
BEGIN
  IF to_regclass('public.legacy_candidates') IS NOT NULL THEN
    INSERT INTO public.candidates (org_id, full_name, email, phone, resume_summary, created_at)
    SELECT DISTINCT ON (COALESCE(r.org_id, '00000000-0000-0000-0000-0000000000aa'::uuid), lower(lc.email))
           COALESCE(r.org_id, '00000000-0000-0000-0000-0000000000aa'::uuid), lc.full_name, lc.email, lc.phone, lc.resume_text, lc.created_at
    FROM public.legacy_candidates lc
    LEFT JOIN public.roles r ON r.id = lc.job_id
    ORDER BY COALESCE(r.org_id, '00000000-0000-0000-0000-0000000000aa'::uuid), lower(lc.email), lc.created_at ASC
    ON CONFLICT (org_id, email) DO NOTHING;

    INSERT INTO public.applications (id, org_id, candidate_id, role_id, rubric_version_id, stage, status, knockout_answers, rejection_reason, stage_entered_at, source, created_at)
    SELECT lc.id,
           COALESCE(r.org_id, '00000000-0000-0000-0000-0000000000aa'::uuid),
           c.id,
           lc.job_id,
           rv.id,
           lc.stage,
           CASE WHEN lc.stage = 'hired' THEN 'hired'::public.application_status
                WHEN lc.stage IN ('rejected', 'knocked_out') THEN 'rejected'::public.application_status
                ELSE 'active'::public.application_status END,
           lc.knockout_answers,
           lc.rejection_reason,
           lc.created_at,
           'migrated',
           lc.created_at
    FROM public.legacy_candidates lc
    JOIN public.roles r ON r.id = lc.job_id
    JOIN public.candidates c ON c.email = lc.email AND c.org_id = r.org_id
    LEFT JOIN public.rubric_versions rv ON rv.role_id = lc.job_id AND rv.version = 1
    ON CONFLICT (candidate_id, role_id) DO NOTHING;

    INSERT INTO public.candidate_files (org_id, candidate_id, application_id, kind, storage_path, mime, created_at)
    SELECT a.org_id, a.candidate_id, a.id, 'resume', lc.resume_path, 'application/pdf', lc.created_at
    FROM public.legacy_candidates lc
    JOIN public.applications a ON a.id = lc.id
    WHERE lc.resume_path IS NOT NULL
    ON CONFLICT (storage_path) DO NOTHING;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.screening_interviews') IS NOT NULL THEN
    INSERT INTO public.screen_sessions (org_id, application_id, mode, status, transcript, state, flags, completeness, started_at, completed_at, created_at)
    SELECT a.org_id, si.candidate_id, 'chat'::public.screen_mode, si.status, si.transcript, '{}'::jsonb, COALESCE(si.flags, '[]'::jsonb), si.completeness_score, si.created_at, si.completed_at, si.created_at
    FROM public.screening_interviews si
    JOIN public.applications a ON a.id = si.candidate_id
    ON CONFLICT (application_id) DO NOTHING;

    INSERT INTO public.evidence (org_id, application_id, rubric_version_id, competency_key, source, summary, quotes, completeness, model_version, created_at)
    SELECT a.org_id, si.candidate_id, a.rubric_version_id, ev->>'competency', 'migrated', ev->>'summary', COALESCE(ev->'quotes', '[]'::jsonb), ev->>'completeness', 'legacy', COALESCE(si.completed_at, si.created_at)
    FROM public.screening_interviews si
    JOIN public.applications a ON a.id = si.candidate_id
    CROSS JOIN LATERAL jsonb_array_elements(si.evidence) AS ev
    WHERE si.evidence IS NOT NULL AND jsonb_typeof(si.evidence) = 'array';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.decisions') IS NOT NULL THEN
    INSERT INTO public.stage_events (org_id, application_id, from_stage, to_stage, actor_id, actor_type, reason, created_at)
    SELECT a.org_id, d.candidate_id, d.from_stage, d.to_stage, d.decided_by, 'human'::public.actor_type, d.reason, d.created_at
    FROM public.decisions d
    JOIN public.applications a ON a.id = d.candidate_id;
  END IF;
END $$;

ALTER TABLE public.roles DROP COLUMN IF EXISTS competencies;
ALTER TABLE public.roles DROP COLUMN IF EXISTS screening_questions;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id UUID;
BEGIN
  INSERT INTO public.profiles (id, full_name, company)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'company')
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    company = COALESCE(EXCLUDED.company, public.profiles.company);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'recruiter')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.orgs (name)
  VALUES (COALESCE(NULLIF(NEW.raw_user_meta_data->>'company', ''), 'My Org'))
  RETURNING id INTO v_org_id;

  INSERT INTO public.org_members (org_id, user_id, role)
  VALUES (v_org_id, NEW.id, 'owner')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "anyone can upload a resume" ON storage.objects;
CREATE POLICY "anyone can upload a resume"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'resumes');