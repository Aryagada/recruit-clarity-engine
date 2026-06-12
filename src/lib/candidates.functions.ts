import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ApplySchema = z.object({
  jobId: z.string().uuid(),
  full_name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(50).optional(),
  resume_text: z.string().max(20000).optional(),
  // Storage object path of the uploaded resume PDF — required.
  resume_path: z.string().trim().min(1).max(400),
  knockout_answers: z.record(z.string(), z.string()).default({}),
});

export const applyToJob = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ApplySchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: job, error: jErr } = await supabaseAdmin
      .from("jobs")
      .select("id, status, knockout_criteria")
      .eq("id", data.jobId)
      .single();
    if (jErr || !job) throw new Error("Job not found");
    if (job.status !== "open") throw new Error("This role is not currently accepting applications");

    // Knockout evaluation (only when explicit required_answer)
    let knockedOut = false;
    const criteria = (job.knockout_criteria as { question: string; type: string; required_answer?: string }[]) ?? [];
    for (const c of criteria) {
      if (c.type === "yes_no" && c.required_answer) {
        const ans = (data.knockout_answers[c.question] ?? "").toLowerCase().trim();
        if (ans !== c.required_answer.toLowerCase()) {
          knockedOut = true;
          break;
        }
      }
    }

    const { data: candidate, error } = await supabaseAdmin
      .from("candidates")
      .insert({
        job_id: data.jobId,
        full_name: data.full_name,
        email: data.email,
        phone: data.phone ?? null,
        resume_text: data.resume_text ?? null,
        resume_path: data.resume_path,
        knockout_answers: data.knockout_answers,
        stage: knockedOut ? "knocked_out" : "applied",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { candidateId: candidate.id, knockedOut };
  });

export const getCandidateForScreening = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ candidateId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c, error } = await supabaseAdmin
      .from("candidates")
      .select("id, full_name, stage, jobs(title), screening_interviews(transcript, status)")
      .eq("id", data.candidateId)
      .single();
    if (error || !c) throw new Error("Not found");
    return c;
  });

// Recruiter-only: short-lived signed URL to download a candidate's resume.
// Ownership is enforced by RLS — the authenticated client can only read
// candidates belonging to the recruiter's own jobs. The signed URL itself is
// minted with the service role (private bucket).
export const getResumeUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ candidateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: cand, error } = await context.supabase
      .from("candidates")
      .select("id, resume_path")
      .eq("id", data.candidateId)
      .single();
    if (error || !cand) throw new Error("Candidate not found");
    if (!cand.resume_path) throw new Error("No resume on file");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("resumes")
      .createSignedUrl(cand.resume_path, 120);
    if (sErr || !signed) throw new Error(sErr?.message ?? "Could not create download link");
    return { url: signed.signedUrl };
  });