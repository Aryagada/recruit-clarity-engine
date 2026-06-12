-- ============================================================================
-- Foundation refactor — Checkpoint E: CLEANUP. DO NOT auto-apply.
-- Run by hand (Supabase SQL editor or psql) ONLY after the new model has been
-- verified end-to-end and the count-parity checks in the backfill migration
-- pass. Dropping these is irreversible.
--
-- This file lives in supabase/manual/ (NOT supabase/migrations/) on purpose so
-- `supabase db push` never runs it.
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS public.decisions CASCADE;
DROP TABLE IF EXISTS public.screening_interviews CASCADE;
DROP TABLE IF EXISTS public.legacy_candidates CASCADE;

-- The merged-model enum screening_status is still used by screen_sessions, so
-- it is NOT dropped. candidate_stage is still used by applications/stage_events.

COMMIT;
