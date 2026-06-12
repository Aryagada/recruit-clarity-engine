-- ============================================================================
-- Foundation refactor — Checkpoint C: backfill new tables from legacy data.
-- Idempotent (ON CONFLICT DO NOTHING). Legacy tables (legacy_candidates,
-- screening_interviews, decisions) are intentionally KEPT for soak/rollback —
-- drop them with the separate cleanup script only after verification.
--
-- Key trick: each legacy candidate row becomes ONE application reusing the SAME
-- id. Because legacy candidate ↔ application is 1:1, this lets screening_
-- interviews / decisions / resume paths (all keyed by the legacy candidate id)
-- map straight onto application_id, and keeps any existing /screen/<id> links
-- working after the route param flips to applicationId.
-- ============================================================================

-- 1. rubric_versions v1 from each role (treated as already locked) ----------
INSERT INTO public.rubric_versions
  (org_id, role_id, version, competencies, screening_questions, knockout_rules, locked_at, locked_by, created_at)
SELECT r.org_id, r.id, 1, r.competencies, r.screening_questions, r.knockout_rules, now(), r.recruiter_id, r.created_at
FROM public.roles r
ON CONFLICT (role_id, version) DO NOTHING;

-- 2. candidates(PERSON), deduped on (org, lower(email)); first application wins
INSERT INTO public.candidates (org_id, full_name, email, phone, resume_summary, created_at)
SELECT DISTINCT ON (lower(lc.email))
  '00000000-0000-0000-0000-0000000000aa', lc.full_name, lc.email, lc.phone, lc.resume_text, lc.created_at
FROM public.legacy_candidates lc
ORDER BY lower(lc.email), lc.created_at ASC
ON CONFLICT (org_id, email) DO NOTHING;

-- 3. applications — reuse legacy candidate id as the application id
INSERT INTO public.applications
  (id, org_id, candidate_id, role_id, rubric_version_id, stage, status,
   knockout_answers, rejection_reason, stage_entered_at, source, created_at)
SELECT lc.id,
       '00000000-0000-0000-0000-0000000000aa',
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
JOIN public.candidates c
  ON c.email = lc.email AND c.org_id = '00000000-0000-0000-0000-0000000000aa'
LEFT JOIN public.rubric_versions rv
  ON rv.role_id = lc.job_id AND rv.version = 1
ON CONFLICT (candidate_id, role_id) DO NOTHING;

-- 4. resume_path -> candidate_files
INSERT INTO public.candidate_files
  (org_id, candidate_id, application_id, kind, storage_path, mime, created_at)
SELECT '00000000-0000-0000-0000-0000000000aa', a.candidate_id, a.id, 'resume', lc.resume_path, 'application/pdf', lc.created_at
FROM public.legacy_candidates lc
JOIN public.applications a ON a.id = lc.id
WHERE lc.resume_path IS NOT NULL;

-- 5. screening_interviews -> screen_sessions (run-level flags move here)
INSERT INTO public.screen_sessions
  (org_id, application_id, mode, status, transcript, state, flags, completeness, started_at, completed_at, created_at)
SELECT '00000000-0000-0000-0000-0000000000aa', si.candidate_id, 'chat', si.status,
       si.transcript, '{}'::jsonb, COALESCE(si.flags, '[]'::jsonb),
       si.completeness_score, si.created_at, si.completed_at, si.created_at
FROM public.screening_interviews si
JOIN public.applications a ON a.id = si.candidate_id
ON CONFLICT (application_id) DO NOTHING;

-- 6. screening_interviews.evidence (JSON array) -> one evidence row per competency
INSERT INTO public.evidence
  (org_id, application_id, rubric_version_id, competency_key, source, summary, quotes, completeness, model_version, created_at)
SELECT '00000000-0000-0000-0000-0000000000aa', si.candidate_id, a.rubric_version_id,
       ev->>'competency', 'migrated', ev->>'summary',
       COALESCE(ev->'quotes', '[]'::jsonb), ev->>'completeness', 'legacy',
       COALESCE(si.completed_at, si.created_at)
FROM public.screening_interviews si
JOIN public.applications a ON a.id = si.candidate_id
CROSS JOIN LATERAL jsonb_array_elements(si.evidence) AS ev
WHERE si.evidence IS NOT NULL AND jsonb_typeof(si.evidence) = 'array';

-- 7. decisions -> stage_events
INSERT INTO public.stage_events
  (org_id, application_id, from_stage, to_stage, actor_id, actor_type, reason, created_at)
SELECT '00000000-0000-0000-0000-0000000000aa', d.candidate_id, d.from_stage, d.to_stage, d.decided_by, 'human', d.reason, d.created_at
FROM public.decisions d
JOIN public.applications a ON a.id = d.candidate_id;

-- 8. Drop the columns that moved to rubric_versions.
ALTER TABLE public.roles DROP COLUMN IF EXISTS competencies;
ALTER TABLE public.roles DROP COLUMN IF EXISTS screening_questions;

-- 9. New signups get their own org + owner membership.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id UUID;
BEGIN
  INSERT INTO public.profiles (id, full_name, company)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'company');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'recruiter');

  INSERT INTO public.orgs (name)
  VALUES (COALESCE(NULLIF(NEW.raw_user_meta_data->>'company', ''), 'My Org'))
  RETURNING id INTO v_org_id;
  INSERT INTO public.org_members (org_id, user_id, role) VALUES (v_org_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- Verification (run manually after apply; expect old/new counts to match):
--   SELECT (SELECT count(*) FROM legacy_candidates) AS legacy,
--          (SELECT count(*) FROM applications)      AS applications;
--   SELECT (SELECT count(DISTINCT lower(email)) FROM legacy_candidates) AS distinct_people,
--          (SELECT count(*) FROM candidates)                            AS candidates;
--   SELECT (SELECT count(*) FROM screening_interviews) AS interviews,
--          (SELECT count(*) FROM screen_sessions)      AS sessions;
--   SELECT (SELECT count(*) FROM decisions)   AS decisions,
--          (SELECT count(*) FROM stage_events) AS stage_events;
-- ----------------------------------------------------------------------------
