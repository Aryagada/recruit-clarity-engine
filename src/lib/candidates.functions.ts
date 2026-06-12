import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ApplySchema = z.object({
  // The role id (kept as `jobId` so the public apply form contract is unchanged).
  jobId: z.string().uuid(),
  full_name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(50).optional(),
  resume_text: z.string().max(20000).optional(),
  resume_path: z.string().trim().min(1).max(400),
  knockout_answers: z.record(z.string(), z.string()).default({}),
});

// Public, unauthenticated. Dedups the PERSON on (org_id, email) so repeat
// applicants land on one candidates row, then creates the per-role application,
// the resume file pointer, and a system stage event. Runs on the service-role
// client because there is no session on the public apply page.
export const applyToJob = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ApplySchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: role, error: rErr } = await supabaseAdmin
      .from("roles")
      .select("id, org_id, status, knockout_rules")
      .eq("id", data.jobId)
      .single();
    if (rErr || !role) throw new Error("Job not found");
    if (role.status !== "open") throw new Error("This role is not currently accepting applications");

    // Knockout evaluation (only when an explicit required_answer is set).
    let knockedOut = false;
    const criteria = (role.knockout_rules as { question: string; type: string; required_answer?: string }[]) ?? [];
    for (const c of criteria) {
      if (c.type === "yes_no" && c.required_answer) {
        const ans = (data.knockout_answers[c.question] ?? "").toLowerCase().trim();
        if (ans !== c.required_answer.toLowerCase()) {
          knockedOut = true;
          break;
        }
      }
    }

    const { data: rv } = await supabaseAdmin
      .from("rubric_versions")
      .select("id")
      .eq("role_id", role.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Upsert the person (dedup on org_id + email; citext => case-insensitive).
    const { data: person, error: pErr } = await supabaseAdmin
      .from("candidates")
      .upsert(
        {
          org_id: role.org_id,
          full_name: data.full_name,
          email: data.email,
          phone: data.phone ?? null,
          resume_summary: data.resume_text ?? null,
          last_active_at: new Date().toISOString(),
        },
        { onConflict: "org_id,email" },
      )
      .select("id")
      .single();
    if (pErr || !person) throw new Error(pErr?.message ?? "Could not save candidate");

    const { data: app, error: aErr } = await supabaseAdmin
      .from("applications")
      .insert({
        org_id: role.org_id,
        candidate_id: person.id,
        role_id: role.id,
        rubric_version_id: rv?.id ?? null,
        knockout_answers: data.knockout_answers,
        stage: knockedOut ? "knocked_out" : "applied",
        status: knockedOut ? "rejected" : "active",
        source: "apply",
      })
      .select("id")
      .single();
    if (aErr) {
      // 23505 = unique(candidate_id, role_id)
      if ((aErr as { code?: string }).code === "23505") {
        throw new Error("You've already applied to this role.");
      }
      throw new Error(aErr.message);
    }

    await supabaseAdmin.from("candidate_files").insert({
      org_id: role.org_id,
      candidate_id: person.id,
      application_id: app.id,
      kind: "resume",
      storage_path: data.resume_path,
      mime: "application/pdf",
    });
    await supabaseAdmin.from("stage_events").insert({
      org_id: role.org_id,
      application_id: app.id,
      from_stage: null,
      to_stage: knockedOut ? "knocked_out" : "applied",
      actor_type: "system",
      reason: knockedOut ? "Failed disclosed knockout criteria" : "Applied",
    });

    return { applicationId: app.id, knockedOut };
  });

// Public: the screening page hydrates from this (by application id).
export const getApplicationForScreening = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: app, error } = await supabaseAdmin
      .from("applications")
      .select(
        "id, stage, status, needs_human_screen, candidates(full_name), roles(title), screen_sessions(transcript, status, mode, completed_at)",
      )
      .eq("id", data.applicationId)
      .single();
    if (error || !app) throw new Error("Not found");
    return app;
  });

// Candidate-initiated request for a human screen instead of the AI one. Flags
// the application and records the request in the audit trail.
export const requestHumanScreen = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: app, error } = await supabaseAdmin
      .from("applications")
      .select("id, org_id, stage")
      .eq("id", data.applicationId)
      .single();
    if (error || !app) throw new Error("Application not found");

    await supabaseAdmin.from("applications").update({ needs_human_screen: true }).eq("id", app.id);
    await supabaseAdmin.from("stage_events").insert({
      org_id: app.org_id,
      application_id: app.id,
      from_stage: app.stage,
      to_stage: app.stage,
      actor_type: "system",
      reason: "Candidate requested a human screen",
    });
    await supabaseAdmin.from("audit_log").insert({
      org_id: app.org_id,
      action: "request_human_screen",
      entity: "application",
      entity_id: app.id,
    });
    return { ok: true };
  });

// Recruiter-only: short-lived signed URL for a candidate's resume. Ownership is
// enforced by RLS on candidate_files (org-scoped); the signed URL is minted with
// the service role because the bucket is private.
export const getResumeUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: file, error } = await context.supabase
      .from("candidate_files")
      .select("storage_path")
      .eq("application_id", data.applicationId)
      .eq("kind", "resume")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!file) throw new Error("No resume on file");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("resumes")
      .createSignedUrl(file.storage_path, 120);
    if (sErr || !signed) throw new Error(sErr?.message ?? "Could not create download link");
    return { url: signed.signedUrl };
  });
