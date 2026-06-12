import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateObject, generateText } from "ai";

// True only when a full AI provider config is present. When false, the
// server functions fall back to deterministic dev stubs (ai-stub.server.ts)
// so the product flow works locally with no API key.
function aiConfigured() {
  return Boolean(process.env.AI_API_KEY && process.env.AI_BASE_URL && process.env.AI_MODEL);
}

// Returns a configured language model. Reads provider config from the
// environment INSIDE the function (module-scope reads ship to the client
// bundle as undefined — see config.server.ts). Vendor-neutral: point
// AI_BASE_URL/AI_MODEL at any OpenAI-compatible provider.
async function getModel() {
  const apiKey = process.env.AI_API_KEY;
  const baseURL = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;
  const missing = [
    ...(!apiKey ? ["AI_API_KEY"] : []),
    ...(!baseURL ? ["AI_BASE_URL"] : []),
    ...(!model ? ["AI_MODEL"] : []),
  ];
  if (missing.length) throw new Error(`Missing AI environment variable(s): ${missing.join(", ")}`);
  // Dynamic import keeps the gateway module out of the client bundle if ever reached.
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
  .handler(async ({ data }) => {
    if (!aiConfigured()) {
      const { buildStubRubric } = await import("./ai-stub.server");
      return RubricSchema.parse(buildStubRubric(data.title, data.description));
    }
    const model = await getModel();
    const { object } = await generateObject({
      model,
      schema: RubricSchema,
      system:
        "You design hiring rubrics for high-volume roles. Output 4-7 behavioral competencies with 1-4 behaviorally anchored scales, OBJECTIVE knockout criteria (work auth, location, shift, license — never proxies for protected class), and 4-8 structured screening questions mapped to competencies. Be concrete, avoid bias, no personality tests.",
      prompt: `Job title: ${data.title}\n\nJob description:\n${data.description}\n\nGenerate the rubric.`,
    });
    return object;
  });

// Public: generate next AI screening question or end the interview.
const TurnInput = z.object({
  candidateId: z.string().uuid(),
  candidateMessage: z.string().max(4000).optional(),
});

export const screeningTurn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TurnInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cand, error } = await supabaseAdmin
      .from("candidates")
      .select("id, full_name, stage, jobs(id, title, description, screening_questions, competencies)")
      .eq("id", data.candidateId)
      .single();
    if (error || !cand) throw new Error("Candidate not found");
    if (cand.stage === "knocked_out" || cand.stage === "rejected" || cand.stage === "hired") {
      throw new Error("Interview not available");
    }
    const job = cand.jobs as unknown as {
      title: string;
      description: string;
      screening_questions: { competency: string; question: string }[];
      competencies: { name: string; description: string }[];
    } | null;
    if (!job) throw new Error("Job missing");

    // Get or create interview
    let { data: interview } = await supabaseAdmin
      .from("screening_interviews")
      .select("*")
      .eq("candidate_id", data.candidateId)
      .maybeSingle();
    if (!interview) {
      const ins = await supabaseAdmin
        .from("screening_interviews")
        .insert({ candidate_id: data.candidateId, status: "in_progress", transcript: [] })
        .select()
        .single();
      interview = ins.data!;
      await supabaseAdmin.from("candidates").update({ stage: "screening" }).eq("id", data.candidateId);
    }

    const transcript = (interview.transcript as { role: "ai" | "candidate"; content: string }[]) ?? [];
    if (data.candidateMessage) {
      transcript.push({ role: "candidate", content: data.candidateMessage });
    }

    let text: string;
    if (!aiConfigured()) {
      const { buildStubInterviewerTurn } = await import("./ai-stub.server");
      text = buildStubInterviewerTurn(job.screening_questions, transcript);
    } else {
      const model = await getModel();
      const systemPrompt = `You are an AI interviewer for "${job.title}". You conduct a structured 10-15 minute screening interview. Rules:
- Be warm, brief, and professional. One question at a time. Short follow-ups are OK to probe for specifics ("can you give a concrete example?") but stay within scope.
- DO NOT evaluate, judge, score, or hint at outcomes.
- DO NOT discuss salary, demographics, or anything protected.
- After covering all required competencies sufficiently, end the interview politely and return a single token: [[INTERVIEW_COMPLETE]]

Competencies to cover: ${job.competencies.map((c) => c.name).join(", ")}
Required questions (cover each at least once, in order, with up to 1 short follow-up):
${job.screening_questions.map((q, i) => `${i + 1}. [${q.competency}] ${q.question}`).join("\n")}

Current progress: ${transcript.length} message(s) exchanged.`;

      const messages = transcript.map((t) => ({
        role: t.role === "candidate" ? ("user" as const) : ("assistant" as const),
        content: t.content,
      }));

      text = (await generateText({
        model,
        system: systemPrompt,
        messages: messages.length
          ? messages
          : [{ role: "user", content: "(candidate joined, please greet them and ask the first question)" }],
      })).text;
    }

    const isComplete = text.includes("[[INTERVIEW_COMPLETE]]");
    const cleanText = text.replace("[[INTERVIEW_COMPLETE]]", "").trim();
    transcript.push({ role: "ai", content: cleanText });

    await supabaseAdmin
      .from("screening_interviews")
      .update({
        transcript,
        status: isComplete ? "completed" : "in_progress",
        completed_at: isComplete ? new Date().toISOString() : null,
      })
      .eq("id", interview.id);

    if (isComplete) {
      // Fire-and-forget evidence extraction
      try {
        await extractEvidenceInternal(data.candidateId);
      } catch (e) {
        console.error("evidence extraction failed", e);
      }
    }

    return { aiMessage: cleanText, complete: isComplete };
  });

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

async function extractEvidenceInternal(candidateId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: interview } = await supabaseAdmin
    .from("screening_interviews")
    .select("*, candidates(jobs(competencies))")
    .eq("candidate_id", candidateId)
    .single();
  if (!interview) return;
  const competencies =
    ((interview.candidates as { jobs: { competencies: { name: string }[] } } | null)?.jobs?.competencies as
      | { name: string }[]
      | undefined) ?? [];
  const transcript = interview.transcript as { role: string; content: string }[];
  let object: z.infer<typeof EvidenceSchema>;
  if (!aiConfigured()) {
    const { buildStubEvidence } = await import("./ai-stub.server");
    object = EvidenceSchema.parse(buildStubEvidence(competencies, transcript));
  } else {
    const model = await getModel();
    object = (await generateObject({
      model,
      schema: EvidenceSchema,
      system:
        "You extract STRUCTURED EVIDENCE from a screening interview transcript. You do NOT score or recommend hire/no-hire. For each competency, summarize what the candidate said, attach direct quotes, and rate completeness of evidence (weak/partial/strong) — NOT the candidate's quality. Flag contradictions, exceptional answers, red flags, and possible AI-generated/fraudulent answers. Be conservative with flags.",
      prompt: `Competencies to cover: ${competencies.map((c) => c.name).join(", ")}\n\nTranscript:\n${transcript
        .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
        .join("\n\n")}`,
    })).object;
  }
  await supabaseAdmin
    .from("screening_interviews")
    .update({
      evidence: object.per_competency,
      flags: object.flags,
      completeness_score: object.completeness_score,
    })
    .eq("id", interview.id);
  await supabaseAdmin.from("candidates").update({ stage: "screened" }).eq("id", candidateId);
}