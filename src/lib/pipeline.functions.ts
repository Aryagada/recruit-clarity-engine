import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const STAGES = ["applied", "knocked_out", "screening", "screened", "shortlisted", "rejected", "hired"] as const;
const STATUSES = ["active", "rejected", "hired", "pooled", "withdrawn"] as const;

const CursorSchema = z.object({ created_at: z.string(), id: z.string().uuid() });

const GetPipelinePageSchema = z.object({
  roleId: z.string().uuid().optional(),
  stage: z.enum(STAGES).optional(),
  status: z.enum(STATUSES).optional(),
  needsHumanOnly: z.boolean().optional(),
  search: z.string().max(120).optional(),
  cursor: CursorSchema.nullish(),
  limit: z.number().int().min(1).max(100).default(50),
});

// Strip PostgREST .or() reserved characters so the search can't break out of
// the ilike filter expression. ILIKE is index-backed by the pg_trgm GIN indexes
// on candidates (see migration 20260612110000).
function sanitizeSearch(q: string): string {
  return q.replace(/[(),]/g, " ").replace(/%/g, "").trim();
}

// Keyset-paginated, server-filtered candidate list across ALL roles in the
// org. Returns THIN rows only (no transcript, no evidence) for the virtualized
// table. Ordering is (created_at desc, id desc) with a cursor instead of OFFSET.
// RLS restricts to the caller's org; org_id eq is belt-and-suspenders.
export const getPipelinePage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GetPipelinePageSchema.parse(input))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("applications")
      .select(
        "id, stage, status, needs_human_screen, created_at, candidates!inner(full_name, email, headline), roles(title), screen_sessions(status, completeness, flags)",
      )
      .eq("org_id", context.orgId);

    if (data.roleId) query = query.eq("role_id", data.roleId);
    if (data.stage) query = query.eq("stage", data.stage);
    if (data.status) query = query.eq("status", data.status);
    if (data.needsHumanOnly) query = query.eq("needs_human_screen", true);

    const search = data.search ? sanitizeSearch(data.search) : "";
    if (search) {
      // candidates!inner means a match filters the parent application rows.
      // Trigram GIN indexes keep this ILIKE off a sequential scan.
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`, { foreignTable: "candidates" });
    }

    if (data.cursor) {
      query = query.or(
        `created_at.lt.${data.cursor.created_at},and(created_at.eq.${data.cursor.created_at},id.lt.${data.cursor.id})`,
      );
    }

    query = query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(data.limit);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const list = rows ?? [];
    const last = list[list.length - 1];
    const nextCursor =
      list.length === data.limit && last ? { created_at: last.created_at, id: last.id } : null;

    return { rows: list, nextCursor };
  });

// FAT drawer payload for ONE application: candidate, role, screen session
// (incl. transcript), and all evidence rows. Cached separately client-side.
export const getApplicationDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: app, error } = await context.supabase
      .from("applications")
      .select(
        "id, stage, status, needs_human_screen, created_at, candidates(full_name, email, phone, headline), roles(title), screen_sessions(status, completeness, flags, transcript), evidence(*)",
      )
      .eq("id", data.applicationId)
      .single();
    if (error || !app) throw new Error("Application not found");
    return app;
  });

// Send an application to the talent pool: status -> pooled (stage unchanged),
// with a stage_events row + audit_log entry. Mirrors decideApplication's write
// pattern (see jobs.functions.ts).
export const poolApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: app, error: aErr } = await context.supabase
      .from("applications")
      .select("id, stage, org_id")
      .eq("id", data.applicationId)
      .single();
    if (aErr || !app) throw new Error("Application not found");

    const { error: uErr } = await context.supabase
      .from("applications")
      .update({ status: "pooled" })
      .eq("id", data.applicationId);
    if (uErr) throw new Error(uErr.message);

    await context.supabase.from("stage_events").insert({
      org_id: app.org_id,
      application_id: data.applicationId,
      from_stage: app.stage,
      to_stage: app.stage,
      actor_id: context.userId,
      actor_type: "human",
      reason: "Pooled",
    });
    await context.supabase.from("audit_log").insert({
      org_id: app.org_id,
      actor: context.userId,
      action: "pool_application",
      entity: "application",
      entity_id: data.applicationId,
      detail: { stage: app.stage },
    });
    return { ok: true };
  });

// Lightweight role list for the console's role filter dropdown.
export const listRoleOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("roles")
      .select("id, title, status")
      .eq("org_id", context.orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Cheap total applicant count for a role/org — a single COUNT(*) over the
// covered index (head:true => no rows transferred). Used by the role header and
// pipeline tab instead of loading the full list to call .length.
export const getPipelineCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ roleId: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("org_id", context.orgId);
    if (data.roleId) q = q.eq("role_id", data.roleId);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return { total: count ?? 0 };
  });
