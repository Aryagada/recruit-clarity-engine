-- Scalability #2: work-queue claim function. The runQueuedJobs worker (server
-- side, service role) calls this to atomically claim queued jobs with
-- FOR UPDATE SKIP LOCKED so multiple workers never grab the same job. Marks them
-- 'running' and bumps attempts; the worker then marks done/failed.
--
-- NOTE: scheduling the worker is the remaining infra step. Until a scheduler
-- (pg_cron+pg_net, a Supabase scheduled function, or external cron) calls
-- runQueuedJobs, the app's INLINE evidence-extraction fallback keeps working —
-- the queue path only activates when USE_EVIDENCE_QUEUE is set AND a worker runs.

CREATE OR REPLACE FUNCTION public.claim_jobs(p_limit int DEFAULT 5)
RETURNS SETOF public.jobs
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.jobs j
  SET status = 'running', attempts = attempts + 1, updated_at = now()
  WHERE j.id IN (
    SELECT id FROM public.jobs
    WHERE status = 'queued' AND run_after <= now()
    ORDER BY priority DESC, run_after ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  RETURNING j.*;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_jobs(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_jobs(int) TO service_role;
