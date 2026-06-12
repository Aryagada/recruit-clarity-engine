CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION citext SET SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT org_id FROM public.org_members WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.org_members WHERE user_id = auth.uid() AND org_id = _org)
$$;

REVOKE EXECUTE ON FUNCTION public.current_org_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated, service_role;