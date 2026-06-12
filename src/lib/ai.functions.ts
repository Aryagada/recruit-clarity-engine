import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateObject, generateText } from "ai";

// True only when a full AI provider config is present. When false, the server
// functions fall back to deterministic dev stubs (ai-stub.server.ts) so the
// product flow works locally with no API key.
function aiConfigured() {
  return Boolean(process.env.AI_API_KEY && process.env.AI_BASE_URL && process.env.AI_MODEL);
}

// Model tiering (spec §7): a cheap/fast model for interactive turn-taking, a
// stronger model for evidence extraction. Both fall back to AI_MODEL when the
// tier-specific var is unset.
function tierModelId(tier: "fast" | "strong") {
  return (tier === "fast" ? process.env.AI_MODEL_FAST : process.env.AI_MODEL_STRONG) || process.env.AI_MODEL;
}

// Identifies which "model" produced a write — the live model id, or "stub".
function modelVersion(tier: "fast" | "strong" = "strong") {
  return aiConfigured() ? tierModelId(tier) ?? "unknown" : "stub";
}

async function getModel(tier: "fast" | "strong" = "strong") {
  const apiKey = process.env.AI_API_KEY;
  const baseURL = process.env.AI_BASE_URL;
  const model = tierModelId(tier);
  const missing = [
    ...(!apiKey ? ["AI_API_KEY"] : []),
    ...(!baseURL ? ["AI_BASE_URL"] : []),
    ...(!model ? ["AI_MODEL"] : []),
  ];
  if (missing.length) throw new Error(`Missing AI environment variable(s): ${missing.join(", ")}`);
  const { createAiProvider } = await import("./ai-gateway.server");
  return createAiProvider({ apiKey: apiKey!, baseURL: baseURL! })(model!);
}

const RubricSchema = z.object({
  competencies: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        anchors: z.array(z.string()).length(4),
      }),
    )
    .min(4)
    .max(7),
  knockout_criteria: z.array(
    z.object({
      question: z.string(),
      type: z.enum(["yes_no", "text"]),
      required_answer: z.string().optional(),
    }),
  ),
  screening_questions: z
    .array(z.object({ competency: z.string(), question: z.string() }))
    .min(4)
    .max(8),
});

export const generateRubric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ title: z.string().min(1), description: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let rubric: z.infer<typeof RubricSchema>;
    if (!aiConfigured()) {
      const { buildStubRubric } = await import("./ai-stub.server");
      rubric = RubricSchema.parse(buildStubRubric(data.title, data.description));
    } else {
      const model = await getModel();
      const { object } = await generateObject({
        model,
        schema: RubricSchema,
        system:
          "You design hiring rubrics for high-volume roles. Output 4-7 behavioral competencies with 1-4 behaviorally anchored scales, OBJECTIVE knockout criteria (work auth, location, shift, license — never proxies for protected class), and 4-8 structured screening questions mapped to competencies. Be concrete, avoid bias, no personality tests.",
        prompt: `Job title: ${data.title}\n\nJob description:\n${data.description}\n\nGenerate the rubric.`,
      });
      rubric = object;
    }
    // EU AI Act / QA: log every inference with the model + prompt version.
    await context.supabase.from("audit_log").insert({
      org_id: context.orgId,
      actor: context.userId,
      action: "llm_generate_rubric",
      entity: "role",
      detail: { model_version: modelVersion(), prompt_version: "rubric.v1", title: data.title },
    });
    return rubric;
  });

// ---------------------------------------------------------------------------
// AI screening turn — public, keyed by application id. Resumable: state +
// transcript live on screen_sessions, so a dropped connection picks back up.
// ---------------------------------------------------------------------------
const TurnInput = z.object({
  applicationId: z.string().uuid(),
  candidateMessage: z.string().max(4000).optional(),
});

type TMsg = { role: "ai" | "candidate"; content: string };

export const screeningTurn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TurnInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: app, error } = await supabaseAdmin
      .from("applications")
      .select(
        "id, org_id, stage, status, rubric_version_id, candidates(full_name), roles(title, description), rubric_versions(competencies, screening_questions)",
      )
      .eq("id", data.applicationId)
      .single();
    if (error || !app) throw new Error("Application not found");
    if (app.status === "rejected" || app.status === "hired" || app.stage === "knocked_out") {
      throw new Error("Interview not available");
    }
    const role = app.roles as unknown as { title: string; description: string } | null;
    const rubric = app.rubric_versions as unknown as {
      competencies: { name: string; description: string }[];
      screening_questions: { competency: string; question: string }[];
    } | null;
    if (!role || !rubric) throw new Error("Role / rubric missing");
    const competencies = rubric.competencies ?? [];
    const screeningQuestions = rubric.screening_questions ?? [];

    // Get or create the (single) session for this application.
    let { data: session } = await supabaseAdmin
      .from("screen_sessions")
      .select("*")
      .eq("application_id", data.applicationId)
      .maybeSingle();
    if (!session) {
      const ins = await supabaseAdmin
        .from("screen_sessions")
        .insert({
          org_id: app.org_id,
          application_id: data.applicationId,
          mode: "chat",
          status: "in_progress",
          transcript: [],
          started_at: new Date().toISOString(),
        })
        .select()
        .single();
      session = ins.data!;
      await supabaseAdmin
        .from("applications")
        .update({ stage: "screening", stage_entered_at: new Date().toISOString() })
        .eq("id", data.applicationId);
      await supabaseAdmin.from("stage_events").insert({
        org_id: app.org_id,
        application_id: data.applicationId,
        from_stage: "applied",
        to_stage: "screening",
        actor_type: "system",
        reason: "AI screening started",
      });
    }

    const transcript = (session.transcript as TMsg[]) ?? [];
    if (data.candidateMessage) transcript.push({ role: "candidate", content: data.candidateMessage });

    let text: string;
    if (!aiConfigured()) {
      const { buildStubInterviewerTurn } = await import("./ai-stub.server");
      text = buildStubInterviewerTurn(screeningQuestions, transcript);
    } else {
      const model = await getModel("fast");
      const systemPrompt = `You are an AI interviewer for "${role.title}". You conduct a structured 10-15 minute screening interview. Rules:
- Be warm, brief, and professional. One question at a time. Short follow-ups are OK to probe for specifics ("can you give a concrete example?") but stay within scope.
- DO NOT evaluate, judge, score, or hint at outcomes.
- DO NOT discuss salary, demographics, or anything protected.
- After covering all required competencies sufficiently, end the interview politely and return a single token: [[INTERVIEW_COMPLETE]]

Competencies to cover: ${competencies.map((c) => c.name).join(", ")}
Required questions (cover each at least once, in order, with up to 1 short follow-up):
${screeningQuestions.map((q, i) => `${i + 1}. [${q.competency}] ${q.question}`).join("\n")}

Current progress: ${transcript.length} message(s) exchanged.`;

      const messages = transcript.map((t) => ({
        role: t.role === "candidate" ? ("user" as const) : ("assistant" as const),
        content: t.content,
      }));

      text = (
        await generateText({
          model,
          system: systemPrompt,
          messages: messages.length
            ? messages
            : [{ role: "user", content: "(candidate joined, please greet them and ask the first question)" }],
        })
      ).text;
    }

    const isComplete = text.includes("[[INTERVIEW_COMPLETE]]");
    const cleanText = text.replace("[[INTERVIEW_COMPLETE]]", "").trim();
    transcript.push({ role: "ai", content: cleanText });

    await supabaseAdmin
      .from("screen_sessions")
      .update({
        transcript,
        state: { turns: transcript.length },
        status: isComplete ? "completed" : "in_progress",
        completed_at: isComplete ? new Date().toISOString() : null,
      })
      .eq("id", session.id);

    if (isComplete) {
      await enqueueOrRunEvidence(data.applicationId, app.org_id);
    }

    return { aiMessage: cleanText, complete: isComplete };
  });

// ---------------------------------------------------------------------------
// Evidence extraction — versioned & append-only. Each run INSERTs a fresh set
// of evidence rows (never overwrites), tagged with extraction_id, rubric
// version and model. Quotes are verified against the transcript before write
// (hallucination guard); fabricated spans are dropped and logged.
// ---------------------------------------------------------------------------
const EvidenceSchema = z.object({
  per_competency: z.array(
    z.object({
      competency: z.string(),
      summary: z.string(),
      quotes: z.array(z.string()),
      completeness: z.enum(["weak", "partial", "strong"]),
    }),
  ),
  flags: z.array(
    z.object({
      kind: z.enum(["red_flag", "exceptional", "contradiction", "fraud_suspect"]),
      note: z.string(),
      quote: z.string().optional(),
    }),
  ),
  completeness_score: z.number().int().min(0).max(100),
});

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

async function extractEvidenceInternal(applicationId: string, actorType: "human" | "system", actorId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: app } = await supabaseAdmin
    .from("applications")
    .select("id, org_id, rubric_version_id, stage, rubric_versions(competencies)")
    .eq("id", applicationId)
    .single();
  if (!app) return;
  const { data: session } = await supabaseAdmin
    .from("screen_sessions")
    .select("id, transcript")
    .eq("application_id", applicationId)
    .maybeSingle();
  if (!session) return;

  const competencies =
    ((app.rubric_versions as { competencies: { name: string }[] } | null)?.competencies as
      | { name: string }[]
      | undefined) ?? [];
  const transcript = (session.transcript as { role: string; content: string }[]) ?? [];

  let object: z.infer<typeof EvidenceSchema>;
  if (!aiConfigured()) {
    const { buildStubEvidence } = await import("./ai-stub.server");
    object = EvidenceSchema.parse(buildStubEvidence(competencies, transcript));
  } else {
    const model = await getModel();
    object = (
      await generateObject({
        model,
        schema: EvidenceSchema,
        system:
          "You extract STRUCTURED EVIDENCE from a screening interview transcript. You do NOT score or recommend hire/no-hire. For each competency, summarize what the candidate said, attach VERBATIM direct quotes copied exactly from the transcript, and rate completeness of evidence (weak/partial/strong) — NOT the candidate's quality. Flag contradictions, exceptional answers, red flags, and possible AI-generated/fraudulent answers. Be conservative with flags.",
        prompt: `Competencies to cover: ${competencies.map((c) => c.name).join(", ")}\n\nTranscript:\n${transcript
          .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
          .join("\n\n")}`,
      })
    ).object;
  }

  // Hallucination guard: only keep quotes that actually appear in what the
  // candidate said. The quote-to-transcript link is the integrity anchor.
  const candidateHay = normalize(
    transcript.filter((t) => t.role === "candidate").map((t) => t.content).join("\n"),
  );
  let droppedQuotes = 0;
  const verifiedComps = object.per_competency.map((c) => {
    const kept = c.quotes.filter((q) => {
      const ok = q.trim().length > 0 && candidateHay.includes(normalize(q));
      if (!ok) droppedQuotes += 1;
      return ok;
    });
    return { ...c, quotes: kept };
  });

  const extractionId = crypto.randomUUID();
  const mv = modelVersion();
  const rows = verifiedComps.map((c) => ({
    org_id: app.org_id,
    application_id: applicationId,
    rubric_version_id: app.rubric_version_id,
    extraction_id: extractionId,
    competency_key: c.competency,
    source: "ai_screen",
    summary: c.summary,
    quotes: c.quotes,
    completeness: c.completeness,
    model_version: mv,
  }));
  if (rows.length) {
    const { error: evErr } = await supabaseAdmin.from("evidence").insert(rows);
    if (evErr) throw new Error(evErr.message);
  }

  // Run-level flags + completeness live on the session.
  await supabaseAdmin
    .from("screen_sessions")
    .update({ flags: object.flags, completeness: object.completeness_score })
    .eq("id", session.id);

  // Advance to "screened" (only forward — don't regress a later stage on re-run).
  if (["applied", "knocked_out", "screening"].includes(app.stage)) {
    await supabaseAdmin
      .from("applications")
      .update({ stage: "screened", stage_entered_at: new Date().toISOString() })
      .eq("id", applicationId);
    await supabaseAdmin.from("stage_events").insert({
      org_id: app.org_id,
      application_id: applicationId,
      from_stage: app.stage,
      to_stage: "screened",
      actor_type: "system",
      reason: "Evidence extracted",
    });
  }

  await supabaseAdmin.from("audit_log").insert({
    org_id: app.org_id,
    actor: actorId ?? null,
    action: "extract_evidence",
    entity: "application",
    entity_id: applicationId,
    detail: {
      model_version: mv,
      extraction_id: extractionId,
      competencies: rows.length,
      dropped_quotes: droppedQuotes,
      actor_type: actorType,
    },
  });
}

// Recruiter-triggered re-extraction (e.g. after prompts improve). Writes a new
// evidence version; never overwrites prior runs. RLS confirms org ownership.
export const rerunEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: app, error } = await context.supabase
      .from("applications")
      .select("id")
      .eq("id", data.applicationId)
      .single();
    if (error || !app) throw new Error("Application not found");
    await extractEvidenceInternal(data.applicationId, "human", context.userId);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Voice screening intake — public webhook. A voice-agent provider POSTs the
// finished transcript here (provider itself is stubbed this cycle). The body is
// HMAC-verified, the session stored as mode='voice', and evidence extracted.
// ---------------------------------------------------------------------------
const VoiceWebhookInput = z.object({
  applicationId: z.string().uuid(),
  transcript: z.array(z.object({ role: z.enum(["ai", "candidate"]), content: z.string().max(8000) })).max(200),
  signature: z.string().min(1),
});

export const voiceTranscriptWebhook = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => VoiceWebhookInput.parse(input))
  .handler(async ({ data }) => {
    const secret = process.env.VOICE_WEBHOOK_SECRET;
    if (!secret) throw new Error("Voice webhook not configured (VOICE_WEBHOOK_SECRET missing)");

    const { createHmac, timingSafeEqual } = await import("node:crypto");
    const payload = `${data.applicationId}:${JSON.stringify(data.transcript)}`;
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(data.signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error("Invalid webhook signature");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: app, error } = await supabaseAdmin
      .from("applications")
      .select("id, org_id, stage, status")
      .eq("id", data.applicationId)
      .single();
    if (error || !app) throw new Error("Application not found");
    if (app.status === "rejected" || app.status === "hired" || app.stage === "knocked_out") {
      throw new Error("Interview not available");
    }

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("screen_sessions")
      .upsert(
        {
          org_id: app.org_id,
          application_id: data.applicationId,
          mode: "voice",
          status: "completed",
          transcript: data.transcript,
          state: { turns: data.transcript.length },
          started_at: now,
          completed_at: now,
        },
        { onConflict: "application_id" },
      );

    await enqueueOrRunEvidence(data.applicationId, app.org_id);
    return { ok: true };
  });

// On screen completion: enqueue an extract_evidence job when the async queue is
// enabled (USE_EVIDENCE_QUEUE + a worker draining it), otherwise extract inline.
// Inline is the safe default so evidence always appears with no extra infra.
async function enqueueOrRunEvidence(applicationId: string, orgId: string) {
  if (process.env.USE_EVIDENCE_QUEUE) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("jobs").insert({
      org_id: orgId,
      kind: "extract_evidence",
      payload: { applicationId },
      priority: 1,
    });
    return;
  }
  try {
    await extractEvidenceInternal(applicationId, "system");
  } catch (e) {
    console.error("evidence extraction failed", e);
  }
}

// ---------------------------------------------------------------------------
// Queue worker (spec §7). Drains queued jobs at controlled concurrency. Invoke
// on a schedule (pg_cron+pg_net / Supabase scheduled function / external cron)
// with the shared WORKER_SECRET. Until a scheduler runs it, the inline fallback
// above keeps evidence extraction working.
// ---------------------------------------------------------------------------
const MAX_ATTEMPTS = 5;

export const runQueuedJobs = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ secret: z.string().min(1), limit: z.number().int().min(1).max(50).default(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    const expected = process.env.WORKER_SECRET;
    if (!expected) throw new Error("Worker not configured (WORKER_SECRET missing)");
    if (data.secret !== expected) throw new Error("Unauthorized");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: claimed, error } = await (supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: Array<{ id: string; kind: string; payload: unknown; attempts: number }> | null; error: { message: string } | null }>)(
      "claim_jobs",
      { p_limit: data.limit },
    );
    if (error) throw new Error(error.message);

    let done = 0;
    let failed = 0;
    for (const job of claimed ?? []) {
      try {
        if (job.kind === "extract_evidence") {
          const applicationId = (job.payload as { applicationId?: string })?.applicationId;
          if (!applicationId) throw new Error("missing applicationId in payload");
          await extractEvidenceInternal(applicationId, "system");
        } else {
          throw new Error(`unknown job kind: ${job.kind}`);
        }
        await supabaseAdmin.from("jobs").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", job.id);
        done += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const dead = job.attempts >= MAX_ATTEMPTS;
        await supabaseAdmin
          .from("jobs")
          .update({
            status: dead ? "failed" : "queued",
            last_error: msg,
            run_after: new Date(Date.now() + Math.min(60_000 * job.attempts, 300_000)).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        failed += 1;
      }
    }
    return { claimed: (claimed ?? []).length, done, failed };
  });
