// Dev-mode fallbacks used when no AI provider is configured (AI_* env vars
// absent). Lets the full product flow — create role → publish → apply →
// screen → pipeline — run end-to-end locally with no API key. The shapes
// here mirror the Zod schemas in ai.functions.ts. The moment real AI_* keys
// are set, these are bypassed and the live provider is used instead.

type Rubric = {
  competencies: { name: string; description: string; anchors: string[] }[];
  knockout_criteria: { question: string; type: "yes_no" | "text"; required_answer?: string }[];
  screening_questions: { competency: string; question: string }[];
};

const ANCHORS = (skill: string) => [
  `1 — No evidence of ${skill}; vague or off-topic answers.`,
  `2 — Limited ${skill}; relies on generalities without specifics.`,
  `3 — Solid ${skill}; gives concrete, relevant examples.`,
  `4 — Exceptional ${skill}; quantified impact and clear ownership.`,
];

export function buildStubRubric(title: string, _description: string): Rubric {
  const role = title.trim() || "the role";
  return {
    competencies: [
      { name: "Role-relevant experience", description: `Demonstrated hands-on experience directly relevant to ${role}.`, anchors: ANCHORS("relevant experience") },
      { name: "Communication", description: "Explains situations clearly, listens, and structures answers logically.", anchors: ANCHORS("communication") },
      { name: "Problem solving", description: "Breaks down ambiguous problems and reasons toward concrete solutions.", anchors: ANCHORS("problem solving") },
      { name: "Reliability & ownership", description: "Follows through on commitments and takes responsibility for outcomes.", anchors: ANCHORS("ownership") },
    ],
    knockout_criteria: [
      { question: "Are you legally authorized to work in the role's location?", type: "yes_no", required_answer: "yes" },
      { question: "Can you work the required schedule for this role?", type: "yes_no", required_answer: "yes" },
      { question: "What is your earliest available start date?", type: "text" },
    ],
    screening_questions: [
      { competency: "Role-relevant experience", question: `Walk me through a recent project most relevant to ${role}. What was your specific contribution?` },
      { competency: "Communication", question: "Tell me about a time you had to explain something complex to a non-expert. How did you approach it?" },
      { competency: "Problem solving", question: "Describe a difficult problem you faced recently and how you worked through it." },
      { competency: "Reliability & ownership", question: "Give an example of a commitment you made that became hard to keep. What did you do?" },
    ],
  };
}

type TurnMsg = { role: "ai" | "candidate"; content: string };

// Deterministic canned interviewer: greets, then asks each required question
// in order with no follow-ups, then ends with the completion token the caller
// looks for.
export function buildStubInterviewerTurn(
  questions: { competency: string; question: string }[],
  transcript: TurnMsg[],
): string {
  const asked = transcript.filter((t) => t.role === "ai").length;
  if (asked === 0) {
    const first = questions[0]?.question ?? "Tell me a bit about your background.";
    return `Hi, thanks for joining — this is a short structured screening, around 10 minutes. To start: ${first}`;
  }
  const next = questions[asked];
  if (next) {
    return `Thanks, that's helpful. Next: ${next.question}`;
  }
  return "Thanks — that's everything I needed. We'll be in touch about next steps. [[INTERVIEW_COMPLETE]]";
}

type Evidence = {
  per_competency: { competency: string; summary: string; quotes: string[]; completeness: "weak" | "partial" | "strong" }[];
  flags: { kind: "red_flag" | "exceptional" | "contradiction" | "fraud_suspect"; note: string; quote?: string }[];
  completeness_score: number;
};

export function buildStubEvidence(
  competencies: { name: string }[],
  transcript: { role: string; content: string }[],
): Evidence {
  const candidateQuotes = transcript.filter((t) => t.role === "candidate").map((t) => t.content);
  return {
    per_competency: competencies.map((c, i) => ({
      competency: c.name,
      summary: `[Dev stub] Candidate provided responses relevant to ${c.name}. Connect an AI provider for a real evidence summary.`,
      quotes: candidateQuotes[i] ? [candidateQuotes[i]] : [],
      completeness: "partial",
    })),
    flags: [],
    completeness_score: candidateQuotes.length ? 60 : 0,
  };
}
