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

// Create a role + its locked rubric v1. Competencies / knockouts / questions
// live on rubric_versions (immutable, audited) — the role row only carries the
// posting + the live knockout_rules used at apply time.
export const createJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateJobSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { competencies, knockout_criteria, screening_questions, title, description, status } = data;
    const { data: role, error } = await context.supabase
      .from("roles")
      .insert({
        org_id: context.orgId,
        recruiter_id: context.userId,
        title,
        description,
        status,
        knockout_rules: knockout_criteria,
        opened_at: status === "open" ? new Date().toISOString() : null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const { error: rvErr } = await context.supabase.from("rubric_versions").insert({
      org_id: context.orgId,
      role_id: role.id,
      version: 1,
      competencies,
      screening_questions,
      knockout_rules: knockout_criteria,
      locked_at: new Date().toISOString(),
      locked_by: context.userId,
    });
    if (rvErr) throw new Error(rvErr.message);
    return role;
  });

export const listMyJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // RLS restricts to the caller's org; recruiter_id is no longer the boundary.
    const { data, error } = await context.supabase
      .from("roles")
      .select("*")
      .eq("org_id", context.orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

// Role + its latest rubric version, merged into one shape so the editor can
// render competencies/knockouts/questions without a second round-trip. The
// `knockout_criteria` alias keeps the existing editor field names intact.
export const getJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: role, error } = await context.supabase
      .from("roles")
      .select("*")
      .eq("id", data.jobId)
      .single();
    if (error) throw new Error(error.message);
    const { data: rv } = await context.supabase
      .from("rubric_versions")
      .select("*")
      .eq("role_id", role.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      ...role,
      knockout_criteria: role.knockout_rules,
      competencies: rv?.competencies ?? [],
      screening_questions: rv?.screening_questions ?? [],
      rubric_version: rv?.version ?? 1,
      rubric_version_id: rv?.id ?? null,
    };
  });

// Pipeline data: applications for the role, each with its person, screen
// session, evidence rows, and file pointers. RLS restricts to the caller's org.
export const listJobCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: apps, error } = await context.supabase
      .from("applications")
      .select("*, candidates(*), screen_sessions(*), evidence(*)")
      .eq("role_id", data.jobId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return apps ?? [];
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

// Update role basics + live knockout rules. If the rubric content changed, a
// NEW locked rubric_versions row is minted (the prior one is immutable) — this
// is the auditable "edit creates a version" behavior the spec requires.
export const updateJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateJobSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { jobId, title, description, status, competencies, knockout_criteria, screening_questions } = data;

    const { data: existing } = await context.supabase
      .from("roles")
      .select("status")
      .eq("id", jobId)
      .single();

    const update: {
      title: string;
      description: string;
      knockout_rules: typeof knockout_criteria;
      status: "draft" | "open" | "closed";
      opened_at?: string;
      closed_at?: string;
    } = { title, description, knockout_rules: knockout_criteria, status };
    if (existing && existing.status !== "open" && status === "open") update.opened_at = new Date().toISOString();
    if (existing && existing.status !== "closed" && status === "closed") update.closed_at = new Date().toISOString();

    const { data: role, error } = await context.supabase
      .from("roles")
      .update(update)
      .eq("id", jobId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const { data: latest } = await context.supabase
      .from("rubric_versions")
      .select("*")
      .eq("role_id", jobId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const changed =
      !latest ||
      JSON.stringify(latest.competencies) !== JSON.stringify(competencies) ||
      JSON.stringify(latest.screening_questions) !== JSON.stringify(screening_questions) ||
      JSON.stringify(latest.knockout_rules) !== JSON.stringify(knockout_criteria);

    if (changed) {
      const { error: rvErr } = await context.supabase.from("rubric_versions").insert({
        org_id: context.orgId,
        role_id: jobId,
        version: (latest?.version ?? 0) + 1,
        competencies,
        screening_questions,
        knockout_rules: knockout_criteria,
        locked_at: new Date().toISOString(),
        locked_by: context.userId,
      });
      if (rvErr) throw new Error(rvErr.message);
    }
    return role;
  });

export const updateJobStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ jobId: z.string().uuid(), status: z.enum(["draft", "open", "closed"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: { status: "draft" | "open" | "closed"; opened_at?: string; closed_at?: string } = { status: data.status };
    if (data.status === "open") patch.opened_at = new Date().toISOString();
    if (data.status === "closed") patch.closed_at = new Date().toISOString();
    const { error } = await context.supabase.from("roles").update(patch).eq("id", data.jobId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Human stage decision on an application. Writes the application, the
// stage_events audit row, and an audit_log entry. (Renamed from decideCandidate
// now that decisions key off applications, not the merged candidate.)
export const decideApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        applicationId: z.string().uuid(),
        toStage: z.enum(["shortlisted", "rejected", "hired"]),
        reason: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: app, error: aErr } = await context.supabase
      .from("applications")
      .select("id, stage, org_id")
      .eq("id", data.applicationId)
      .single();
    if (aErr || !app) throw new Error("Application not found");

    const fromStage = app.stage;
    const status =
      data.toStage === "hired" ? "hired" : data.toStage === "rejected" ? "rejected" : "active";

    const { error: uErr } = await context.supabase
      .from("applications")
      .update({
        stage: data.toStage,
        status,
        stage_entered_at: new Date().toISOString(),
        rejection_reason: data.toStage === "rejected" ? data.reason ?? null : null,
      })
      .eq("id", data.applicationId);
    if (uErr) throw new Error(uErr.message);

    await context.supabase.from("stage_events").insert({
      org_id: app.org_id,
      application_id: data.applicationId,
      from_stage: fromStage,
      to_stage: data.toStage,
      actor_id: context.userId,
      actor_type: "human",
      reason: data.reason ?? null,
    });
    await context.supabase.from("audit_log").insert({
      org_id: app.org_id,
      actor: context.userId,
      action: "decide_application",
      entity: "application",
      entity_id: data.applicationId,
      detail: { from_stage: fromStage, to_stage: data.toStage },
    });
    return { ok: true };
  });
