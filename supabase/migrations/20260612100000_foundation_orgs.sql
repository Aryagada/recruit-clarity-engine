-- ============================================================================
-- Foundation refactor — Checkpoint A: orgs + multi-tenancy primitives.
-- Purely additive: touches NO existing table. Safe to apply on its own.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- Orgs: the multi-tenant root. Every domain table will carry org_id.
CREATE TABLE public.orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  retention_months INT NOT NULL DEFAULT 24,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.orgs TO authenticated;
GRANT ALL ON public.orgs TO service_role;
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;

-- Org-scoped roles (distinct from the global app_role enum, which we keep).
CREATE TYPE public.org_member_role AS ENUM ('owner', 'admin', 'recruiter', 'hm', 'interviewer', 'viewer');

CREATE TABLE public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.org_member_role NOT NULL DEFAULT 'recruiter',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
CREATE INDEX idx_org_members_user ON public.org_members(user_id);
GRANT SELECT ON public.org_members TO authenticated;
GRANT ALL ON public.org_members TO service_role;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
-- Non-recursive self-policy. Membership is granted by the signup trigger /
-- service role only — never self-served — to prevent privilege escalation.
CREATE POLICY "read own memberships" ON public.org_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER helpers. Same recipe as public.has_role: STABLE +
-- SET search_path. Being SECURITY DEFINER, they bypass RLS on org_members, so
-- other tables' policies can call them WITHOUT triggering recursive RLS.
-- EXECUTE must stay granted to `authenticated` because RLS policy expressions
-- are evaluated as the calling role (unlike has_role, which no policy calls).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.org_members WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members WHERE user_id = auth.uid() AND org_id = _org
  )
$$;

REVOKE EXECUTE ON FUNCTION public.current_org_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated, service_role;

CREATE POLICY "members read their org" ON public.orgs
  FOR SELECT TO authenticated USING (public.is_org_member(id));

-- ---------------------------------------------------------------------------
-- Default org + backfill memberships for already-registered users, so the
-- existing single-tenant data has a home. New signups get their own org via
-- the updated handle_new_user trigger (see the backfill migration).
-- The fixed UUID keeps re-runs idempotent and lets the backfill reference it.
-- ---------------------------------------------------------------------------
INSERT INTO public.orgs (id, name)
VALUES ('00000000-0000-0000-0000-0000000000aa', 'Default Org')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (org_id, user_id, role)
SELECT '00000000-0000-0000-0000-0000000000aa',
       ur.user_id,
       CASE WHEN ur.role = 'admin' THEN 'admin'::public.org_member_role
            ELSE 'recruiter'::public.org_member_role END
FROM public.user_roles ur
ON CONFLICT (org_id, user_id) DO NOTHING;
