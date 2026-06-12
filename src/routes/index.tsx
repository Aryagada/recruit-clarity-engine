import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck, FileSearch, Gavel, Clock, Users, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Interview OS — AI gathers evidence. Humans decide on people." },
      {
        name: "description",
        content:
          "An AI-native hiring platform for high-volume roles. Compress application to shortlist from weeks to 48 hours with structured, auditable evidence at every stage.",
      },
      { property: "og:title", content: "Interview OS" },
      {
        property: "og:description",
        content: "AI gathers evidence. Humans decide on people. Built for high-volume hiring.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground ios-mono text-xs">
              iOS
            </span>
            Interview OS
          </Link>
          <nav className="hidden gap-8 text-sm text-muted-foreground md:flex">
            <a href="#thesis" className="hover:text-foreground">The thesis</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#line" className="hover:text-foreground">The automation line</a>
            <a href="#compliance" className="hover:text-foreground">Compliance</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Link to="/auth"><Button size="sm">Start free</Button></Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-border">
        <div className="ios-grid-bg absolute inset-0 opacity-40" />
        <div className="relative mx-auto max-w-6xl px-6 py-24 md:py-32">
          <div className="ios-eyebrow mb-6">AI-native hiring · for high-volume roles</div>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] md:text-6xl">
            AI gathers evidence.<br />
            <span className="text-muted-foreground">Humans decide on people.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Interview OS runs the hiring funnel end-to-end for 100s–1000s of applicants per role.
            Cut time-to-shortlist from weeks to under 48 hours — with structured, auditable evidence at every
            stage, not gut-feel scores.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/auth">
              <Button size="lg" className="gap-2">Open the recruiter console <ArrowRight className="h-4 w-4" /></Button>
            </Link>
            <a href="#how">
              <Button size="lg" variant="outline">See how it works</Button>
            </a>
          </div>
          <div className="mt-16 grid grid-cols-2 gap-8 border-t border-border pt-8 md:grid-cols-4">
            {[
              { k: "<48h", v: "Time to shortlist" },
              { k: "−70%", v: "Recruiter hours / hire" },
              { k: "100", v: "Reviewed in 90 mins" },
              { k: "0", v: "Auto-rejections beyond knockouts" },
            ].map((s) => (
              <div key={s.v}>
                <div className="ios-mono text-3xl font-semibold tracking-tight">{s.k}</div>
                <div className="mt-1 text-sm text-muted-foreground">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="thesis" className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="ios-eyebrow mb-3">The thesis</div>
          <h2 className="max-w-3xl text-3xl font-semibold md:text-4xl">
            Most "AI hiring" products fail one of two ways. We drew the line deliberately.
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { t: "Automate evidence", d: "Parsing, scheduling, transcription, knockout checks, and competency mapping — the repetitive work AI does well." },
              { t: "Assist judgment", d: "Ranked shortlists, drafted rubrics, suggested probes. Humans approve. Never a single 'hire score.'" },
              { t: "Reserve decisions", d: "Hire/no-hire, final interviews, sensitive context, comp — only humans. Every override is logged." },
            ].map((p) => (
              <div key={p.t} className="rounded-lg border border-border bg-card p-6">
                <div className="text-lg font-semibold">{p.t}</div>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="border-b border-border bg-secondary/40">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="ios-eyebrow mb-3">How it works</div>
          <h2 className="text-3xl font-semibold md:text-4xl">From 2,000 applications to a defensible shortlist — in 48 hours.</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              { i: FileSearch, t: "1 · Role + rubric", d: "Paste a JD. AI drafts behaviorally-anchored competencies, knockout criteria, and structured questions. You lock the rubric." },
              { i: Users, t: "2 · Intake & knockout", d: "Candidates apply through your link. Objective knockouts auto-reject with honest, instant feedback. No silent resume filtering." },
              { i: Clock, t: "3 · Async AI screen", d: "Every eligible candidate gets a 10-15 min structured chat or voice interview, 24/7, in their language. 500 screens in 48 hours." },
              { i: FileSearch, t: "4 · Evidence, not scores", d: "Per-competency evidence with direct quotes and completeness signals. Flags for contradictions, exceptional answers, and fraud — never a hireability number." },
              { i: Gavel, t: "5 · Shortlist console", d: "Review 100 candidates in 90 minutes with keyboard-driven evidence cards. Every reject requires a reason." },
              { i: ShieldCheck, t: "6 · Audit trail", d: "Every AI output, every human decision, every override — timestamped, exportable, ready for an LL144 or EU AI Act review." },
            ].map((s) => {
              const Icon = s.i;
              return (
                <div key={s.t} className="rounded-lg border border-border bg-card p-6">
                  <Icon className="h-5 w-5 text-accent" />
                  <div className="mt-4 font-semibold">{s.t}</div>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.d}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="line" className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="ios-eyebrow mb-3">The automation line</div>
          <h2 className="text-3xl font-semibold md:text-4xl">Every feature flows from one rule.</h2>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            <Panel title="Fully automated" tone="muted" items={["Resume parsing", "Knockout & eligibility", "Scheduling & reminders", "Status communications", "Interview transcription", "Evidence extraction (with quotes)", "Funnel analytics", "Fraud / AI-answer flagging"]} />
            <Panel title="AI-assisted, human approves" tone="accent" items={["Ranked shortlists", "Async screening interviews", "Rubric & question generation", "Candidate-specific probes", "Rejection reasons (drafted)", "Offer letter drafting"]} />
            <Panel title="Human-only" tone="primary" items={["Hire / no-hire decisions", "Final-round interviews", "Sensitive context & edge cases", "Compensation negotiation", "Overriding any AI flag", "Accommodation requests"]} />
          </div>
          <p className="mt-10 max-w-3xl text-sm text-muted-foreground">
            Design rule: the system never displays a single "hire score." Composite scores invite rubber-stamping;
            evidence invites judgment.
          </p>
        </div>
      </section>

      <section id="compliance" className="border-b border-border bg-secondary/40">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="ios-eyebrow mb-3">Compliance by design</div>
          <h2 className="max-w-3xl text-3xl font-semibold md:text-4xl">
            Built for EU AI Act, NYC LL144, EEOC, and DPDP — out of the box.
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <Bullet icon={Scale} title="Human-in-the-loop, by architecture" body="Every consequential decision has a human approver. Every automated stage has a human-alternative path." />
            <Bullet icon={ShieldCheck} title="Audit-ready exports" body="LL144 bias audits, EU AI Act conformity documentation, EEOC adverse-impact monitoring — continuous, not annual." />
            <Bullet icon={FileSearch} title="Evidence with sources" body="Every AI claim links to a transcript timestamp. Humans see the quote, not just the summary." />
            <Bullet icon={Gavel} title="What we will NOT build" body="No facial expression analysis. No personality tests. No social media scraping. No single hireability score. No autonomous decisions." />
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h2 className="text-3xl font-semibold md:text-4xl">Stop ghosting candidates. Start hiring on evidence.</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Open a free recruiter account. Set up your first role in under 10 minutes.
          </p>
          <Link to="/auth" className="mt-8 inline-block">
            <Button size="lg" className="gap-2">Open the recruiter console <ArrowRight className="h-4 w-4" /></Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground">
          <div>© Interview OS</div>
          <div className="ios-mono">v1.0 · evidence over scores</div>
        </div>
      </footer>
    </div>
  );
}

function Panel({ title, items, tone }: { title: string; items: string[]; tone: "muted" | "accent" | "primary" }) {
  const toneCls =
    tone === "primary"
      ? "border-primary/30 bg-primary/[0.03]"
      : tone === "accent"
        ? "border-accent/30 bg-accent/[0.04]"
        : "border-border bg-card";
  return (
    <div className={`rounded-lg border p-6 ${toneCls}`}>
      <div className="ios-eyebrow mb-4">{title}</div>
      <ul className="space-y-2 text-sm">
        {items.map((i) => (
          <li key={i} className="flex gap-2">
            <span className="ios-mono text-muted-foreground">›</span>
            <span>{i}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bullet({ icon: Icon, title, body }: { icon: typeof Scale; title: string; body: string }) {
  return (
    <div className="flex gap-4 rounded-lg border border-border bg-card p-6">
      <Icon className="mt-1 h-5 w-5 shrink-0 text-accent" />
      <div>
        <div className="font-semibold">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
