import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateRubric } from "@/lib/ai.functions";
import { createJob } from "@/lib/jobs.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/jobs/new")({
  head: () => ({ meta: [{ title: "New role · Interview OS" }] }),
  component: NewJob,
});

type Rubric = Awaited<ReturnType<typeof generateRubric>>;

function NewJob() {
  const navigate = useNavigate();
  const gen = useServerFn(generateRubric);
  const create = useServerFn(createJob);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [busy, setBusy] = useState(false);

  async function draft() {
    if (!title.trim() || description.trim().length < 20) {
      toast.error("Add a title and a longer description");
      return;
    }
    setBusy(true);
    try {
      const r = await gen({ data: { title, description } });
      setRubric(r);
      toast.success("Rubric drafted. Edit and publish.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI failed");
    } finally { setBusy(false); }
  }

  async function save(publish: boolean) {
    if (!rubric) return;
    setBusy(true);
    try {
      const job = await create({ data: {
        title, description,
        status: publish ? "open" : "draft",
        knockout_criteria: rubric.knockout_criteria,
        competencies: rubric.competencies,
        screening_questions: rubric.screening_questions,
      }});
      toast.success(publish ? "Role published" : "Saved as draft");
      navigate({ to: "/app/jobs/$jobId", params: { jobId: job.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="ios-eyebrow">New role</div>
      <h1 className="mt-1 text-2xl font-semibold">Set up the rubric</h1>
      <p className="mt-1 text-sm text-muted-foreground">AI drafts behaviorally-anchored competencies, objective knockouts, and structured questions from your JD. You review, edit, and lock.</p>

      <div className="mt-8 space-y-4 rounded-lg border border-border bg-card p-6">
        <div>
          <Label htmlFor="title">Role title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. SDR — North America" />
        </div>
        <div>
          <Label htmlFor="desc">Job description</Label>
          <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={8} placeholder="Paste the JD…" />
        </div>
        <Button onClick={draft} disabled={busy} className="gap-2">
          {busy && !rubric ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {rubric ? "Regenerate rubric" : "Draft rubric with AI"}
        </Button>
      </div>

      {rubric && (
        <div className="mt-6 space-y-6">
          <Section title="Competencies">
            <ul className="space-y-3">
              {rubric.competencies.map((c) => (
                <li key={c.name} className="rounded-md border border-border p-4">
                  <div className="font-medium">{c.name}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Knockout criteria">
            <ul className="space-y-2 text-sm">
              {rubric.knockout_criteria.map((k, i) => (
                <li key={i} className="rounded-md border border-border p-3">
                  <span className="ios-mono text-xs text-muted-foreground">{k.type}{k.required_answer ? ` · expects: ${k.required_answer}` : ""}</span>
                  <div>{k.question}</div>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Structured screening questions">
            <ul className="space-y-2 text-sm">
              {rubric.screening_questions.map((q, i) => (
                <li key={i} className="rounded-md border border-border p-3">
                  <span className="ios-eyebrow">{q.competency}</span>
                  <div className="mt-1">{q.question}</div>
                </li>
              ))}
            </ul>
          </Section>
          <div className="flex gap-2">
            <Button onClick={() => save(true)} disabled={busy}>Publish role</Button>
            <Button onClick={() => save(false)} variant="outline" disabled={busy}>Save as draft</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="ios-eyebrow mb-4">{title}</div>
      {children}
    </div>
  );
}