import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { screeningTurn } from "@/lib/ai.functions";
import { getCandidateForScreening } from "@/lib/candidates.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/screen/$candidateId")({
  head: () => ({ meta: [{ title: "Screening interview · Interview OS" }] }),
  component: Screen,
});

type Msg = { role: "ai" | "candidate"; content: string };

function Screen() {
  const { candidateId } = Route.useParams();
  const fetch = useServerFn(getCandidateForScreening);
  const turn = useServerFn(screeningTurn);
  const { data, isLoading } = useQuery({ queryKey: ["cand", candidateId], queryFn: () => fetch({ data: { candidateId } }) });
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [complete, setComplete] = useState(false);
  const [started, setStarted] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const mut = useMutation({
    mutationFn: (msg?: string) => turn({ data: { candidateId, candidateMessage: msg } }),
    onSuccess: (res) => {
      setMessages((m) => [...m, { role: "ai", content: res.aiMessage }]);
      setComplete(res.complete);
      setTimeout(() => taRef.current?.focus(), 50);
    },
  });

  useEffect(() => {
    if (!started && data) {
      const existing = (Array.isArray(data.screening_interviews) ? data.screening_interviews[0] : data.screening_interviews) as { transcript: Msg[]; status: string } | null;
      if (existing?.transcript?.length) {
        setMessages(existing.transcript);
        if (existing.status === "completed") setComplete(true);
        setStarted(true);
      }
    }
  }, [data, started]);

  function start() { setStarted(true); mut.mutate(undefined); }
  function send() {
    if (!input.trim() || mut.isPending) return;
    const msg = input.trim();
    setMessages((m) => [...m, { role: "candidate", content: msg }]);
    setInput("");
    mut.mutate(msg);
  }

  if (isLoading || !data) return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;
  const job = data.jobs as { title: string } | null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground ios-mono text-xs">iOS</span>
            Interview OS
          </Link>
          <span className="ios-mono text-xs text-muted-foreground">{job?.title}</span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
        {!started ? (
          <div className="m-auto max-w-lg text-center">
            <div className="ios-eyebrow">AI screening interview</div>
            <h1 className="mt-2 text-3xl font-semibold">Hi {data.full_name.split(" ")[0]}.</h1>
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
              This is a 10–15 minute structured chat interview conducted by AI. It will be recorded and reviewed by a human recruiter.
              No score is produced — only evidence linked to your own answers.
              You can request a human-conducted screen instead by replying to your application email.
            </p>
            <Button className="mt-8" size="lg" onClick={start} disabled={mut.isPending}>{mut.isPending ? "Starting…" : "I consent — begin"}</Button>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "candidate" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${m.role === "candidate" ? "bg-primary text-primary-foreground" : "bg-card border border-border"}`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {mut.isPending && <div className="text-xs text-muted-foreground">Interviewer is typing…</div>}
            </div>
            {complete ? (
              <div className="mt-6 rounded-lg border border-accent/30 bg-accent/5 p-6 text-center">
                <div className="ios-eyebrow text-accent">Complete</div>
                <h3 className="mt-2 font-semibold">Thanks — your interview is in.</h3>
                <p className="mt-1 text-sm text-muted-foreground">A recruiter will review your evidence and get back to you, either way.</p>
              </div>
            ) : (
              <div className="mt-6 flex gap-2 border-t border-border pt-4">
                <Textarea ref={taRef} value={input} onChange={(e) => setInput(e.target.value)} rows={2} placeholder="Type your answer…" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
                <Button onClick={send} disabled={mut.isPending || !input.trim()}>Send</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}