
-- Roles
CREATE TYPE public.app_role AS ENUM ('recruiter', 'admin');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  company TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Trigger: auto-create profile and assign recruiter role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, company)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'company');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'recruiter');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Jobs
CREATE TYPE public.job_status AS ENUM ('draft', 'open', 'closed');

CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status public.job_status NOT NULL DEFAULT 'draft',
  knockout_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  competencies JSONB NOT NULL DEFAULT '[]'::jsonb,
  screening_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT SELECT ON public.jobs TO anon;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recruiter manages own jobs" ON public.jobs FOR ALL TO authenticated
  USING (recruiter_id = auth.uid()) WITH CHECK (recruiter_id = auth.uid());
CREATE POLICY "open jobs publicly readable" ON public.jobs FOR SELECT TO anon USING (status = 'open');
CREATE POLICY "open jobs readable signed in" ON public.jobs FOR SELECT TO authenticated USING (status = 'open' OR recruiter_id = auth.uid());

-- Candidates
CREATE TYPE public.candidate_stage AS ENUM ('applied', 'knocked_out', 'screening', 'screened', 'shortlisted', 'rejected', 'hired');

CREATE TABLE public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  resume_text TEXT,
  knockout_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  stage public.candidate_stage NOT NULL DEFAULT 'applied',
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidates TO authenticated;
GRANT ALL ON public.candidates TO service_role;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recruiter sees own job candidates" ON public.candidates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.recruiter_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.recruiter_id = auth.uid()));

CREATE INDEX idx_candidates_job ON public.candidates(job_id);

-- Screening interviews
CREATE TYPE public.screening_status AS ENUM ('pending', 'in_progress', 'completed');

CREATE TABLE public.screening_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL UNIQUE REFERENCES public.candidates(id) ON DELETE CASCADE,
  status public.screening_status NOT NULL DEFAULT 'pending',
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence JSONB,
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  completeness_score INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE ON public.screening_interviews TO authenticated;
GRANT ALL ON public.screening_interviews TO service_role;
ALTER TABLE public.screening_interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recruiter reads interviews for own jobs" ON public.screening_interviews FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.candidates c JOIN public.jobs j ON c.job_id = j.id
    WHERE c.id = candidate_id AND j.recruiter_id = auth.uid()
  ));

-- Decisions audit log
CREATE TABLE public.decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  decided_by UUID NOT NULL REFERENCES auth.users(id),
  from_stage public.candidate_stage,
  to_stage public.candidate_stage NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.decisions TO authenticated;
GRANT ALL ON public.decisions TO service_role;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recruiter reads decisions own jobs" ON public.decisions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.candidates c JOIN public.jobs j ON c.job_id = j.id
    WHERE c.id = candidate_id AND j.recruiter_id = auth.uid()
  ));
CREATE POLICY "recruiter inserts decisions own jobs" ON public.decisions FOR INSERT TO authenticated
  WITH CHECK (decided_by = auth.uid() AND EXISTS (
    SELECT 1 FROM public.candidates c JOIN public.jobs j ON c.job_id = j.id
    WHERE c.id = candidate_id AND j.recruiter_id = auth.uid()
  ));
