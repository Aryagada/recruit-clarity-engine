-- Scalability #4: atomic apply. Replaces the 4 sequential client writes in
-- applyToJob with one transactional, SECURITY DEFINER function: dedup-upsert the
-- person, insert the application (handling the unique(candidate_id,role_id)
-- conflict), insert the resume file pointer, and the system stage event — all or
-- nothing. Called by the public apply flow via the service-role client.

CREATE OR REPLACE FUNCTION public.apply_to_role(
  p_role_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_resume_summary text,
  p_resume_path text,
  p_knockout_answers jsonb,
  p_knocked_out boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid;
  v_rubric uuid;
  v_candidate uuid;
  v_application uuid;
  v_stage public.candidate_stage;
  v_status public.application_status;
BEGIN
  SELECT org_id INTO v_org FROM public.roles WHERE id = p_role_id AND status = 'open';
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'role_not_open';
  END IF;

  SELECT id INTO v_rubric FROM public.rubric_versions
    WHERE role_id = p_role_id ORDER BY version DESC LIMIT 1;

  v_stage  := CASE WHEN p_knocked_out THEN 'knocked_out'::public.candidate_stage ELSE 'applied'::public.candidate_stage END;
  v_status := CASE WHEN p_knocked_out THEN 'rejected'::public.application_status ELSE 'active'::public.application_status END;

  INSERT INTO public.candidates (org_id, full_name, email, phone, resume_summary, last_active_at)
  VALUES (v_org, p_full_name, p_email, p_phone, p_resume_summary, now())
  ON CONFLICT (org_id, email) DO UPDATE
    SET full_name      = EXCLUDED.full_name,
        phone          = COALESCE(EXCLUDED.phone, public.candidates.phone),
        resume_summary = COALESCE(EXCLUDED.resume_summary, public.candidates.resume_summary),
        last_active_at = now()
  RETURNING id INTO v_candidate;

  INSERT INTO public.applications
    (org_id, candidate_id, role_id, rubric_version_id, knockout_answers, stage, status, source)
  VALUES (v_org, v_candidate, p_role_id, v_rubric, p_knockout_answers, v_stage, v_status, 'apply')
  ON CONFLICT (candidate_id, role_id) DO NOTHING
  RETURNING id INTO v_application;

  IF v_application IS NULL THEN
    RAISE EXCEPTION 'already_applied';
  END IF;

  INSERT INTO public.candidate_files (org_id, candidate_id, application_id, kind, storage_path, mime)
  VALUES (v_org, v_candidate, v_application, 'resume', p_resume_path, 'application/pdf');

  INSERT INTO public.stage_events (org_id, application_id, from_stage, to_stage, actor_type, reason)
  VALUES (v_org, v_application, NULL, v_stage, 'system',
          CASE WHEN p_knocked_out THEN 'Failed disclosed knockout criteria' ELSE 'Applied' END);

  RETURN v_application;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_to_role(uuid, text, text, text, text, text, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_to_role(uuid, text, text, text, text, text, jsonb, boolean)
  TO service_role;
