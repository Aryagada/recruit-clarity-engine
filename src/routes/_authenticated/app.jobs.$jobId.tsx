import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { getJob, updateJob } from "@/lib/jobs.functions";
import { getPipelineCounts } from "@/lib/pipeline.functions";
import { PipelineConsole } from "@/components/PipelineConsole";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Copy, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/jobs/$jobId")({
  head: () => ({ meta: [{ title: "Role · Interview OS" }] }),
  component: JobDetail,
});

function JobDetail() {
  const { jobId } = Route.useParams();
  const fetchJob = useServerFn(getJob);
  const fetchCounts = useServerFn(getPipelineCounts);
  const jobQuery = useQuery({ queryKey: ["job", jobId], queryFn: () => fetchJob({ data: { jobId } }), staleTime: 30_000 });
  // Cheap COUNT(*) for the header/tab — no row loads (see getPipelineCounts).
  const countsQuery = useQuery({ queryKey: ["pipeline-counts", jobId], queryFn: () => fetchCounts({ data: { roleId: jobId } }), staleTime: 30_000 });
  const total = countsQuery.data?.total;

  if (jobQuery.isError) {
    return (
      <div className="space-y-3">
        <Link to="/app" className="text-sm text-muted-foreground hover:text-foreground">← All roles</Link>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          Couldn't load this role: {jobQuery.error instanceof Error ? jobQuery.error.message : "Unknown error"}
          <Button size="sm" variant="outline" className="ml-3" onClick={() => jobQuery.refetch()}>Retry</Button>
        </div>
      </div>
    );
  }
  if (jobQuery.isLoading || !jobQuery.data) return <div className="text-muted-foreground">Loading…</div>;
  const job = jobQuery.data;
  const applyUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/apply/${job.id}`;

  return (
    <div>
      <Link to="/app" className="text-sm text-muted-foreground hover:text-foreground">← All roles</Link>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{job.title}</h1>
          <div className="mt-1 ios-mono text-xs text-muted-foreground">{job.status} · {total ?? "…"} applicants · rubric v{job.rubric_version}</div>
        </div>
        {job.status === "open" && (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { navigator.clipboard.writeText(applyUrl); toast.success("Apply link copied"); }}>
            <Copy className="h-3.5 w-3.5" /> Copy apply link
          </Button>
        )}
      </div>

      <Tabs defaultValue="edit" className="mt-6">
        <TabsList>
          <TabsTrigger value="edit">Edit role</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline{total != null ? ` (${total})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="mt-6">
          <RoleEditor job={job} onSaved={jobQuery.refetch} />
        </TabsContent>

        <TabsContent value="pipeline" className="mt-6">
          {/* Keyset-paginated + virtualized, scoped to this role (shared with the global console). */}
          <PipelineConsole roleId={jobId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---- Comprehensive role editor ---------------------------------------------

type Competency = { name: string; description: string; anchors: string[] };
type Knockout = { question: string; type: "yes_no" | "text"; required_answer: string };
type Question = { competency: string; question: string };
type Draft = {
  title: string;
  description: string;
  status: "draft" | "open" | "closed";
  competencies: Competency[];
  knockout_criteria: Knockout[];
  screening_questions: Question[];
};

type SavePayload = {
  title: string;
  description: string;
  status: Draft["status"];
  competencies: { name: string; description: string; anchors: string[] }[];
  knockout_criteria: { question: string; type: "yes_no" | "text"; required_answer?: string }[];
  screening_questions: Question[];
};

type JobRow = Awaited<ReturnType<typeof getJob>>;

function toDraft(job: JobRow): Draft {
  const comps = (job.competencies as { name?: string; description?: string; anchors?: string[] }[]) ?? [];
  const kos = (job.knockout_criteria as { question?: string; type?: string; required_answer?: string }[]) ?? [];
  const qs = (job.screening_questions as { competency?: string; question?: string }[]) ?? [];
  return {
    title: job.title ?? "",
    description: job.description ?? "",
    status: (job.status as Draft["status"]) ?? "draft",
    competencies: comps.map((c) => ({ name: c.name ?? "", description: c.description ?? "", anchors: Array.isArray(c.anchors) ? c.anchors : [] })),
    knockout_criteria: kos.map((k) => ({ question: k.question ?? "", type: k.type === "text" ? "text" : "yes_no", required_answer: k.required_answer ?? "" })),
    screening_questions: qs.map((q) => ({ competency: q.competency ?? "", question: q.question ?? "" })),
  };
}

function RoleEditor({ job, onSaved }: { job: JobRow; onSaved: () => void }) {
  const save = useServerFn(updateJob);
  const baseline = toDraft(job);
  const baselineKey = JSON.stringify(baseline);
  const [draft, setDraft] = useState<Draft>(baseline);
  useEffect(() => { setDraft(toDraft(job)); }, [baselineKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(draft) !== baselineKey;
  const setField = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const mutation = useMutation({
    mutationFn: (payload: SavePayload) => save({ data: { jobId: job.id, ...payload } }),
    onSuccess: () => { toast.success("Role saved — rubric edits mint a new locked version"); onSaved(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  function handleSave() {
    const title = draft.title.trim();
    const description = draft.description.trim();
    if (!title) { toast.error("Role title is required"); return; }
    if (!description) { toast.error("Job description is required"); return; }

    const competencies = draft.competencies.map((c) => ({
      name: c.name.trim(),
      description: c.description.trim(),
      anchors: c.anchors.map((a) => a.trim()).filter(Boolean),
    }));
    if (competencies.some((c) => !c.name)) { toast.error("Every competency needs a name"); return; }

    const knockout_criteria = draft.knockout_criteria.map((k) => ({
      question: k.question.trim(),
      type: k.type,
      ...(k.type === "yes_no" && k.required_answer.trim() ? { required_answer: k.required_answer.trim() } : {}),
    }));
    if (knockout_criteria.some((k) => !k.question)) { toast.error("Every knockout needs a question"); return; }

    const screening_questions = draft.screening_questions.map((q) => ({ competency: q.competency.trim(), question: q.question.trim() }));
    if (screening_questions.some((q) => !q.question)) { toast.error("Every screening question needs text"); return; }

    mutation.mutate({ title, description, status: draft.status, competencies, knockout_criteria, screening_questions });
  }

  const competencyOptions = draft.competencies.map((c) => c.name).filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="sticky top-16 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/95 p-4 backdrop-blur">
        <div>
          <div className="ios-eyebrow">Edit role</div>
          <p className="mt-0.5 text-xs text-muted-foreground">JD &amp; status save in place; rubric/eligibility/question edits create a new locked rubric version.</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="ios-mono text-[10px] text-muted-foreground">unsaved changes</span>}
          <Button size="sm" onClick={handleSave} disabled={!dirty || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <Section title="Role basics">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <div>
              <Label htmlFor="title">Role title</Label>
              <Input id="title" value={draft.title} onChange={(e) => setField({ title: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={draft.status}
                onChange={(e) => setField({ status: e.target.value as Draft["status"] })}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="draft">draft</option>
                <option value="open">open (accepting applications)</option>
                <option value="closed">closed</option>
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="desc">Job description (JD)</Label>
            <Textarea id="desc" rows={12} value={draft.description} onChange={(e) => setField({ description: e.target.value })} placeholder="Paste the full JD…" />
          </div>
        </div>
      </Section>

      <Section
        title="Competencies & scoring anchors"
        action={
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setField({ competencies: [...draft.competencies, { name: "", description: "", anchors: [] }] })}>
            <Plus className="h-3.5 w-3.5" />Add competency
          </Button>
        }
      >
        {draft.competencies.length === 0 ? (
          <Empty>No competencies yet.</Empty>
        ) : (
          <div className="space-y-3">
            {draft.competencies.map((c, i) => {
              const set = (patch: Partial<Competency>) => setField({ competencies: draft.competencies.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) });
              return (
                <div key={i} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs text-muted-foreground">Competency {i + 1}</Label>
                    <DeleteBtn onClick={() => setField({ competencies: draft.competencies.filter((_, idx) => idx !== i) })} />
                  </div>
                  <div className="mt-2 space-y-2">
                    <Input placeholder="Name (e.g. Communication)" value={c.name} onChange={(e) => set({ name: e.target.value })} />
                    <Textarea rows={2} placeholder="What this competency measures" value={c.description} onChange={(e) => set({ description: e.target.value })} />
                    <div>
                      <Label className="text-xs text-muted-foreground">Scoring anchors (one per line, e.g. 1–4)</Label>
                      <Textarea
                        rows={4}
                        placeholder={"1 — …\n2 — …\n3 — …\n4 — …"}
                        value={c.anchors.join("\n")}
                        onChange={(e) => set({ anchors: e.target.value.split("\n") })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title="Knockout criteria (eligibility)"
        action={
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setField({ knockout_criteria: [...draft.knockout_criteria, { question: "", type: "yes_no", required_answer: "yes" }] })}>
            <Plus className="h-3.5 w-3.5" />Add knockout
          </Button>
        }
      >
        {draft.knockout_criteria.length === 0 ? (
          <Empty>No knockout criteria. Applicants won't be auto-filtered.</Empty>
        ) : (
          <div className="space-y-3">
            {draft.knockout_criteria.map((k, i) => {
              const set = (patch: Partial<Knockout>) => setField({ knockout_criteria: draft.knockout_criteria.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) });
              return (
                <div key={i} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs text-muted-foreground">Knockout {i + 1}</Label>
                    <DeleteBtn onClick={() => setField({ knockout_criteria: draft.knockout_criteria.filter((_, idx) => idx !== i) })} />
                  </div>
                  <div className="mt-2 space-y-2">
                    <Input placeholder="Question (e.g. Are you authorized to work in the US?)" value={k.question} onChange={(e) => set({ question: e.target.value })} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">Answer type</Label>
                        <select
                          value={k.type}
                          onChange={(e) => set({ type: e.target.value as Knockout["type"] })}
                          className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="yes_no">Yes / No</option>
                          <option value="text">Free text</option>
                        </select>
                      </div>
                      {k.type === "yes_no" && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Required answer to pass</Label>
                          <select
                            value={k.required_answer}
                            onChange={(e) => set({ required_answer: e.target.value })}
                            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <option value="yes">yes</option>
                            <option value="no">no</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title="Screening questions"
        action={
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setField({ screening_questions: [...draft.screening_questions, { competency: competencyOptions[0] ?? "", question: "" }] })}>
            <Plus className="h-3.5 w-3.5" />Add question
          </Button>
        }
      >
        {draft.screening_questions.length === 0 ? (
          <Empty>No questions yet.</Empty>
        ) : (
          <div className="space-y-3">
            {draft.screening_questions.map((q, i) => {
              const set = (patch: Partial<Question>) => setField({ screening_questions: draft.screening_questions.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) });
              return (
                <div key={i} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs text-muted-foreground">Question {i + 1}</Label>
                    <DeleteBtn onClick={() => setField({ screening_questions: draft.screening_questions.filter((_, idx) => idx !== i) })} />
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[220px_1fr]">
                    <Input list="competency-options" placeholder="Competency" value={q.competency} onChange={(e) => set({ competency: e.target.value })} />
                    <Textarea rows={2} placeholder="Question text" value={q.question} onChange={(e) => set({ question: e.target.value })} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <datalist id="competency-options">
          {competencyOptions.map((c) => <option key={c} value={c} />)}
        </datalist>
      </Section>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
        <div className="ios-eyebrow">{title}</div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted-foreground">{children}</div>;
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-destructive hover:text-destructive" onClick={onClick}>
      <Trash2 className="h-3.5 w-3.5" />Delete
    </Button>
  );
}
