import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CompetencySchema = z.object({
  name: z.string(),
  description: z.string(),
  anchors: z.array(z.string()).optional(),
});
const KnockoutSchema = z.object({
  question: z.string(),
  type: z.enum(["yes_no", "text"]),
  required_answer: z.string().optional(),
});
const QuestionSchema = z.object({
  competency: z.string(),
  question: z.string(),
});

const CreateJobSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(20000),
  status: z.enum(["draft", "open", "closed"]).default("draft"),
  knockout_criteria: z.array(KnockoutSchema).default([]),
  competencies: z.array(CompetencySchema).default([]),
  screening_questions: z.array(QuestionSchema).default([]),
});

export const createJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateJobSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .insert({ ...data, recruiter_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return job;
  });

export const listMyJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("jobs")
      .select("*")
      .eq("recruiter_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

// Fast path: just the job. Used to render the role editor immediately,
// without waiting on candidate/transcript data the editor never shows.
export const getJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("*")
      .eq("id", data.jobId)
      .eq("recruiter_id", context.userId)
      .single();
    if (error) throw new Error(error.message);
    return job;
  });

// Pipeline data, loaded in parallel / lazily — kept off the role-open
// critical path because transcripts can be large. RLS already restricts
// candidates to the recruiter's own jobs.
export const listJobCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: candidates, error } = await context.supabase
      .from("candidates")
      .select("*, screening_interviews(*)")
      .eq("job_id", data.jobId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return candidates ?? [];
  });

const UpdateJobSchema = z.object({
  jobId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(20000),
  status: z.enum(["draft", "open", "closed"]),
  competencies: z.array(CompetencySchema).max(30),
  knockout_criteria: z.array(KnockoutSchema).max(30),
  screening_questions: z.array(QuestionSchema).max(50),
});

// Full role update — title, JD, status, competencies, knockouts, and
// screening questions in one save. RLS ("recruiter manages own jobs")
// plus the recruiter_id filter guarantee only the owner can edit.
export const updateJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateJobSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { jobId, ...fields } = data;
    const { data: job, error } = await context.supabase
      .from("jobs")
      .update(fields)
      .eq("id", jobId)
      .eq("recruiter_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return job;
  });

export const updateJobStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ jobId: z.string().uuid(), status: z.enum(["draft", "open", "closed"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("jobs")
      .update({ status: data.status })
      .eq("id", data.jobId)
      .eq("recruiter_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const decideCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        candidateId: z.string().uuid(),
        toStage: z.enum(["shortlisted", "rejected", "hired"]),
        reason: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: candidate, error: cErr } = await context.supabase
      .from("candidates")
      .select("id, stage, job_id, jobs!inner(recruiter_id)")
      .eq("id", data.candidateId)
      .single();
    if (cErr || !candidate) throw new Error("Candidate not found");
    const fromStage = candidate.stage;
    const { error: uErr } = await context.supabase
      .from("candidates")
      .update({ stage: data.toStage, rejection_reason: data.toStage === "rejected" ? data.reason : null })
      .eq("id", data.candidateId);
    if (uErr) throw new Error(uErr.message);
    await context.supabase.from("decisions").insert({
      candidate_id: data.candidateId,
      decided_by: context.userId,
      from_stage: fromStage,
      to_stage: data.toStage,
      reason: data.reason ?? null,
    });
    return { ok: true };
  });