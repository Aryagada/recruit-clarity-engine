import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export type EvidenceRow = {
  competency_key: string;
  summary: string | null;
  quotes: unknown;
  completeness: string | null;
  extraction_id: string;
  created_at: string;
};

export type Flag = { kind: string; note: string; quote?: string };

// Reduce many versioned evidence rows down to the latest extraction run.
export function latestEvidence(rows: EvidenceRow[]): EvidenceRow[] {
  if (!rows.length) return [];
  const latest = rows.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
  return rows.filter((r) => r.extraction_id === latest.extraction_id);
}

// Shared evidence-by-competency + flags rendering, used by both the role
// pipeline panel and the candidates console drawer. The re-run button only
// shows when an onRerun handler is provided (the console drawer omits it).
export function EvidenceCards({
  evidence,
  flags,
  emptyState,
  onRerun,
  rerunning,
}: {
  evidence: EvidenceRow[];
  flags: Flag[];
  emptyState?: React.ReactNode;
  onRerun?: () => void;
  rerunning?: boolean;
}) {
  const evidenceRows = latestEvidence(evidence);

  return (
    <>
      {evidenceRows.length === 0 ? (
        <div className="mt-6 rounded border border-dashed border-border p-6 text-sm text-muted-foreground">
          {emptyState ?? "No evidence yet."}
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="ios-eyebrow">Evidence by competency</div>
            {onRerun && (
              <Button variant="ghost" size="sm" className="gap-1" disabled={rerunning} onClick={onRerun}>
                <RefreshCw className={`h-3.5 w-3.5 ${rerunning ? "animate-spin" : ""}`} />Re-run
              </Button>
            )}
          </div>
          {evidenceRows.map((e) => {
            const quotes = Array.isArray(e.quotes) ? (e.quotes as string[]) : [];
            return (
              <div key={e.competency_key} className="rounded-md border border-border p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{e.competency_key}</div>
                  <span className={`ios-mono text-[10px] rounded px-1.5 py-0.5 ${e.completeness === "strong" ? "bg-accent/15 text-accent" : e.completeness === "partial" ? "bg-muted" : "bg-destructive/10 text-destructive"}`}>{e.completeness}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{e.summary}</p>
                {quotes.length > 0 && (
                  <ul className="mt-3 space-y-1 border-l-2 border-border pl-3 text-sm italic">
                    {quotes.map((q, i) => <li key={i}>"{q}"</li>)}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {flags.length > 0 && (
        <div className="mt-6">
          <div className="ios-eyebrow mb-2">Flags</div>
          <ul className="space-y-2 text-sm">
            {flags.map((f, i) => (
              <li key={i} className="rounded border border-border p-3">
                <span className="ios-mono text-[10px] text-muted-foreground">{f.kind}</span>
                <div>{f.note}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
