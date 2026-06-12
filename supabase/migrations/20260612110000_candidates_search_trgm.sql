-- Scalability #3: make candidate search index-backed. The console searches
-- name/email with ILIKE '%q%'; a leading-wildcard ILIKE can't use a btree, so we
-- add pg_trgm GIN trigram indexes (standard on Supabase). This turns the search
-- from a sequential scan into an index scan as the candidate pool grows.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_candidates_full_name_trgm
  ON public.candidates USING gin (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_candidates_email_trgm
  ON public.candidates USING gin ((email::text) gin_trgm_ops);
