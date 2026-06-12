import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { applyToJob } from "@/lib/candidates.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB — matches the bucket limit

export const getPublicJob = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    // Public read: use the anon client (RLS allows SELECT on open jobs).
    // Does NOT require the service-role key — a public endpoint shouldn't.
    const { supabasePublic } = await import("@/integrations/supabase/public-client.server");
    const { data: job, error } = await supabasePublic
      .from("jobs")
      .select("id, title, description, status, knockout_criteria")
      .eq("id", data.jobId)
      .eq("status", "open")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Role is not accepting applications");
    return job;
  });

export const Route = createFileRoute("/apply/$jobId")({
  head: () => ({ meta: [{ title: "Apply · Interview OS" }] }),
  component: Apply,
});

function Apply() {
  const { jobId } = Route.useParams();
  const fetch = useServerFn(getPublicJob);
  const apply = useServerFn(applyToJob);
  const navigate = useNavigate();
  const { data: job, isLoading, error } = useQuery({ queryKey: ["pubjob", jobId], queryFn: () => fetch({ data: { jobId } }) });
  const [form, setForm] = useState({ full_name: "", email: "", phone: "" });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const mut = useMutation({
    mutationFn: async () => {
      // Validate the required resume document.
      if (!resumeFile) throw new Error("Please attach your resume (PDF).");
      if (resumeFile.type !== "application/pdf") throw new Error("Resume must be a PDF file.");
      if (resumeFile.size > MAX_RESUME_BYTES) throw new Error("Resume must be under 5 MB.");

      // Upload to the private 'resumes' bucket (anon insert policy). Random,
      // unguessable object name under the job's folder.
      const path = `${jobId}/${crypto.randomUUID()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("resumes")
        .upload(path, resumeFile, { contentType: "application/pdf", upsert: false });
      if (upErr) throw new Error(`Resume upload failed: ${upErr.message}`);

      return apply({ data: { jobId, ...form, resume_path: path, knockout_answers: answers } });
    },
    onSuccess: (res) => {
      if (res.knockedOut) {
        toast.error("Based on your answers, this role isn't a match — thank you for applying.");
      } else {
        navigate({ to: "/screen/$candidateId", params: { candidateId: res.candidateId } });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (isLoading) return <Center>Loading…</Center>;
  if (error || !job) return <Center>This role isn't available.</Center>;
  const knockouts = (job.knockout_criteria as { question: string; type: string; required_answer?: string }[]) ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground ios-mono text-xs">iOS</span>
            Interview OS
          </Link>
          <span className="ios-mono text-xs text-muted-foreground">Powered by Interview OS</span>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="ios-eyebrow">Open role</div>
        <h1 className="mt-1 text-3xl font-semibold">{job.title}</h1>
        <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">{job.description}</p>

        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="mt-10 space-y-5 rounded-lg border border-border bg-card p-6">
          <div className="ios-eyebrow">Apply</div>
          <div className="rounded border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
            Next step: a 10–15 minute AI-conducted screening interview. It is recorded and reviewed by a human. You can request a human screen instead by emailing the employer.
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Full name</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><Label>Email</Label><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div><Label>Phone (optional)</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div>
            <Label>Resume (PDF, required)</Label>
            <input
              type="file"
              accept="application/pdf"
              required
              onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full rounded-md border border-input bg-background text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
            />
            {resumeFile && (
              <p className="mt-1 text-xs text-muted-foreground">{resumeFile.name} · {(resumeFile.size / 1024 / 1024).toFixed(2)} MB</p>
            )}
          </div>
          {knockouts.length > 0 && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="ios-eyebrow">Eligibility</div>
              {knockouts.map((k, i) => (
                <div key={i}>
                  <Label>{k.question}</Label>
                  {k.type === "yes_no" ? (
                    <select required value={answers[k.question] ?? ""} onChange={(e) => setAnswers({ ...answers, [k.question]: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option>
                    </select>
                  ) : (
                    <Input required value={answers[k.question] ?? ""} onChange={(e) => setAnswers({ ...answers, [k.question]: e.target.value })} />
                  )}
                </div>
              ))}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={mut.isPending}>{mut.isPending ? "Submitting…" : "Apply & start screening"}</Button>
        </form>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center text-muted-foreground">{children}</div>;
}