-- Resume document upload (PDF), mandatory on the public apply form.

-- Column on candidates holding the storage object path of the uploaded resume.
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS resume_path TEXT;

-- Private storage bucket for resumes. Restrict to PDF, max 5 MB.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('resumes', 'resumes', false, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public = EXCLUDED.public;

-- Public apply form is unauthenticated: allow anon (and authenticated) to
-- UPLOAD into the resumes bucket. No read/update/delete for them — the bucket
-- is private and recruiters read via short-lived signed URLs generated
-- server-side with the service role (see getResumeUrl).
DROP POLICY IF EXISTS "anyone can upload a resume" ON storage.objects;
CREATE POLICY "anyone can upload a resume"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'resumes');
