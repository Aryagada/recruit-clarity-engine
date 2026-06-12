import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getPipelinePage,
  getApplicationDetail,
  poolApplication,
  listRoleOptions,
} from "@/lib/pipeline.functions";
import { decideApplication } from "@/lib/jobs.functions";
import { getResumeUrl } from "@/lib/candidates.functions";
import { EvidenceCards, type EvidenceRow, type Flag } from "@/components/EvidenceCards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/candidates")({
  head: () => ({ meta: [{ title: "Candidates · Interview OS" }] }),
  component: CandidatesConsole,
});

const STAGES = ["applied", "knocked_out", "screening", "screened", "shortlisted", "rejected", "hired"] as const;
const STATUSES = ["active", "rejected", "hired", "pooled", "withdrawn"] as const;
const ALL = "all";

type PageRow = Awaited<ReturnType<typeof getPipelinePage>>["rows"][number];
type Detail = Awaited<ReturnType<typeof getApplicationDetail>>;

type Filters = {
  roleId: string;
  stage: string;
  status: string;
  needsHumanOnly: boolean;
  search: string;
};

// screen_sessions is one-to-one but PostgREST embeds can surface as object or
// single-element array — normalize to the one row (or null).
function sessionOf(row: { screen_sessions: unknown }) {
  const s = row.screen_sessions;
  const obj = Array.isArray(s) ? s[0] : s;
  return (obj ?? null) as { status: string; completeness: number | null; flags: unknown } | null;
}

function CandidatesConsole() {
  const queryClient = useQueryClient();
  const fetchRoles = useServerFn(listRoleOptions);
  const fetchPage = useServerFn(getPipelinePage);
  const fetchDetail = useServerFn(getApplicationDetail);
  const decide = useServerFn(decideApplication);
  const pool = useServerFn(poolApplication);

  const [filters, setFilters] = useState<Filters>({
    roleId: ALL,
    stage: ALL,
    status: ALL,
    needsHumanOnly: false,
    search: "",
  });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search.trim()), 350);
    return () => clearTimeout(t);
  }, [filters.search]);

  const rolesQuery = useQuery({ queryKey: ["role-options"], queryFn: () => fetchRoles(), staleTime: 60_000 });

  // Server-facing filter args (sentinels -> undefined).
  const serverFilters = useMemo(
    () => ({
      roleId: filters.roleId === ALL ? undefined : filters.roleId,
      stage: filters.stage === ALL ? undefined : (filters.stage as (typeof STAGES)[number]),
      status: filters.status === ALL ? undefined : (filters.status as (typeof STATUSES)[number]),
      needsHumanOnly: filters.needsHumanOnly || undefined,
      search: debouncedSearch || undefined,
    }),
    [filters.roleId, filters.stage, filters.status, filters.needsHumanOnly, debouncedSearch],
  );

  const pipelineKey = ["pipeline", serverFilters] as const;
  const infinite = useInfiniteQuery({
    queryKey: pipelineKey,
    initialPageParam: null as { created_at: string; id: string } | null,
    queryFn: ({ pageParam }) => fetchPage({ data: { ...serverFilters, cursor: pageParam } }),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 15_000,
  });

  const rows: PageRow[] = useMemo(
    () => infinite.data?.pages.flatMap((p) => p.rows) ?? [],
    [infinite.data],
  );

  // --- Selection + keyboard nav --------------------------------------------
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const selectedRow = rows.find((r) => r.id === selectedId) ?? null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 64,
    overscan: 10,
  });

  // Prefetch the next keyset page when the last rendered item nears the end.
  const virtualItems = rowVirtualizer.getVirtualItems();
  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (!last) return;
    if (last.index >= rows.length - 5 && infinite.hasNextPage && !infinite.isFetchingNextPage) {
      infinite.fetchNextPage();
    }
  }, [virtualItems, rows.length, infinite.hasNextPage, infinite.isFetchingNextPage, infinite]);

  function selectByIndex(idx: number) {
    const clamped = Math.max(0, Math.min(idx, rows.length - 1));
    const row = rows[clamped];
    if (row) {
      setSelectedId(row.id);
      setReason("");
      rowVirtualizer.scrollToIndex(clamped, { align: "auto" });
    }
  }

  // --- Decisions (optimistic) ----------------------------------------------
  function patchRow(applicationId: string, patch: Partial<Pick<PageRow, "stage" | "status">>) {
    queryClient.setQueriesData<{ pages: { rows: PageRow[]; nextCursor: unknown }[]; pageParams: unknown[] }>(
      { queryKey: ["pipeline"] },
      (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((pg) => ({
            ...pg,
            rows: pg.rows.map((r) => (r.id === applicationId ? { ...r, ...patch } : r)),
          })),
        };
      },
    );
  }

  const decideMut = useMutation({
    mutationFn: (v: { applicationId: string; toStage: "shortlisted" | "rejected" | "hired"; reason?: string }) =>
      decide({ data: v }),
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: ["pipeline"] });
      const snapshot = queryClient.getQueriesData({ queryKey: ["pipeline"] });
      const status = v.toStage === "hired" ? "hired" : v.toStage === "rejected" ? "rejected" : "active";
      patchRow(v.applicationId, { stage: v.toStage, status });
      return { snapshot };
    },
    onError: (e, _v, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(e instanceof Error ? e.message : "Decision failed");
    },
    onSuccess: () => { setReason(""); toast.success("Decision logged"); },
    onSettled: (_d, _e, v) => {
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-detail", v.applicationId] });
    },
  });

  const poolMut = useMutation({
    mutationFn: (v: { applicationId: string }) => pool({ data: v }),
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: ["pipeline"] });
      const snapshot = queryClient.getQueriesData({ queryKey: ["pipeline"] });
      patchRow(v.applicationId, { status: "pooled" });
      return { snapshot };
    },
    onError: (e, _v, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(e instanceof Error ? e.message : "Could not pool candidate");
    },
    onSuccess: () => toast.success("Sent to pool"),
    onSettled: (_d, _e, v) => {
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-detail", v.applicationId] });
    },
  });

  const pending = decideMut.isPending || poolMut.isPending;

  function reject(applicationId: string) {
    if (!reason.trim()) {
      toast.error("Reason required");
      reasonRef.current?.focus();
      return;
    }
    decideMut.mutate({ applicationId, toStage: "rejected", reason: reason.trim() });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
    const idx = selectedId ? rows.findIndex((r) => r.id === selectedId) : -1;
    const key = e.key.toLowerCase();
    if (key === "j") { e.preventDefault(); selectByIndex(idx + 1); }
    else if (key === "k") { e.preventDefault(); selectByIndex(idx === -1 ? 0 : idx - 1); }
    else if (!selectedId) return;
    else if (key === "a") { e.preventDefault(); decideMut.mutate({ applicationId: selectedId, toStage: "shortlisted" }); }
    else if (key === "r") { e.preventDefault(); reasonRef.current?.focus(); if (reason.trim()) reject(selectedId); }
    else if (key === "p") { e.preventDefault(); poolMut.mutate({ applicationId: selectedId }); }
  }

  // --- Detail (fat) payload for the drawer ---------------------------------
  const detailQuery = useQuery({
    queryKey: ["pipeline-detail", selectedId],
    queryFn: () => fetchDetail({ data: { applicationId: selectedId! } }),
    enabled: !!selectedId,
    staleTime: 60_000,
  });

  const roleOptions = rolesQuery.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <div className="ios-eyebrow">Candidates</div>
          <h1 className="mt-1 text-2xl font-semibold">Shortlist console</h1>
        </div>
        <div className="ios-mono text-xs text-muted-foreground">
          {infinite.isLoading ? "…" : `${rows.length} loaded`}{infinite.hasNextPage ? "+" : ""}
        </div>
      </div>

      {/* Filter bar */}
      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <FilterSelect
          label="Role"
          value={filters.roleId}
          onChange={(v) => setFilters((f) => ({ ...f, roleId: v }))}
          options={[{ value: ALL, label: "All roles" }, ...roleOptions.map((r) => ({ value: r.id, label: r.title }))]}
        />
        <FilterSelect
          label="Stage"
          value={filters.stage}
          onChange={(v) => setFilters((f) => ({ ...f, stage: v }))}
          options={[{ value: ALL, label: "Any stage" }, ...STAGES.map((s) => ({ value: s, label: s }))]}
        />
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          options={[{ value: ALL, label: "Any status" }, ...STATUSES.map((s) => ({ value: s, label: s }))]}
        />
        <div className="flex items-center gap-2 pb-2">
          <Switch
            id="needs-human"
            checked={filters.needsHumanOnly}
            onCheckedChange={(v) => setFilters((f) => ({ ...f, needsHumanOnly: v }))}
          />
          <Label htmlFor="needs-human" className="text-sm">Needs human</Label>
        </div>
        <div className="min-w-[220px] flex-1">
          <Label htmlFor="search" className="text-xs text-muted-foreground">Search name / email</Label>
          <Input
            id="search"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Type to search…"
            className="mt-1"
          />
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,520px)_1fr]">
        {/* Virtualized table */}
        <div
          className="rounded-lg border border-border bg-card outline-none"
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="ios-eyebrow">Candidates</div>
            <div className="ios-mono text-[10px] text-muted-foreground">J/K move · A advance · R reject · P pool</div>
          </div>
          {infinite.isError ? (
            <div className="p-6 text-sm text-destructive">
              {infinite.error instanceof Error ? infinite.error.message : "Failed to load"}
              <Button size="sm" variant="outline" className="ml-3" onClick={() => infinite.refetch()}>Retry</Button>
            </div>
          ) : infinite.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading candidates…</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No candidates match these filters.</div>
          ) : (
            <div ref={scrollRef} className="max-h-[70vh] overflow-auto">
              <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
                {virtualItems.map((vi) => {
                  const row = rows[vi.index];
                  const session = sessionOf(row);
                  const person = row.candidates as unknown as { full_name: string; email: string; headline: string | null } | null;
                  const role = row.roles as unknown as { title: string } | null;
                  const flagCount = Array.isArray(session?.flags) ? (session!.flags as unknown[]).length : 0;
                  const isSel = row.id === selectedId;
                  return (
                    <button
                      key={row.id}
                      onClick={() => { setSelectedId(row.id); setReason(""); }}
                      className={`absolute left-0 top-0 w-full border-b border-border px-4 text-left hover:bg-muted/50 ${isSel ? "bg-muted/70" : ""}`}
                      style={{ height: vi.size, transform: `translateY(${vi.start}px)` }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{person?.full_name ?? "—"}</span>
                        <span className="ios-mono text-[10px] rounded bg-muted px-1.5 py-0.5">{row.stage}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{role?.title ?? "—"}</span>
                        <span>·</span>
                        <span className="ios-mono">{session?.completeness != null ? `${session.completeness}/100` : "—"}</span>
                        {flagCount > 0 && <span className="text-destructive">⚑ {flagCount}</span>}
                        {row.needs_human_screen && <span className="rounded bg-amber-500/15 px-1.5 text-amber-600">human?</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
              {infinite.isFetchingNextPage && <div className="p-3 text-center text-xs text-muted-foreground">Loading more…</div>}
            </div>
          )}
        </div>

        {/* Evidence drawer */}
        <div className="rounded-lg border border-border bg-card p-6">
          {!selectedRow ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">Select a candidate to review evidence</div>
          ) : (
            <DetailPanel
              applicationId={selectedRow.id}
              detail={detailQuery.data}
              loading={detailQuery.isLoading}
              reason={reason}
              setReason={setReason}
              reasonRef={reasonRef}
              pending={pending}
              onAdvance={() => decideMut.mutate({ applicationId: selectedRow.id, toStage: "shortlisted" })}
              onHire={() => decideMut.mutate({ applicationId: selectedRow.id, toStage: "hired" })}
              onReject={() => reject(selectedRow.id)}
              onPool={() => poolMut.mutate({ applicationId: selectedRow.id })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1 w-[160px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function DetailPanel({
  applicationId,
  detail,
  loading,
  reason,
  setReason,
  reasonRef,
  pending,
  onAdvance,
  onHire,
  onReject,
  onPool,
}: {
  applicationId: string;
  detail: Detail | undefined;
  loading: boolean;
  reason: string;
  setReason: (v: string) => void;
  reasonRef: React.RefObject<HTMLTextAreaElement | null>;
  pending: boolean;
  onAdvance: () => void;
  onHire: () => void;
  onReject: () => void;
  onPool: () => void;
}) {
  const getResume = useServerFn(getResumeUrl);

  async function openResume() {
    try {
      const { url } = await getResume({ data: { applicationId } });
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open resume");
    }
  }

  if (loading || !detail) return <div className="text-sm text-muted-foreground">Loading evidence…</div>;

  const person = detail.candidates as unknown as { full_name: string; email: string; phone: string | null } | null;
  const session = (Array.isArray(detail.screen_sessions) ? detail.screen_sessions[0] : detail.screen_sessions) as
    | { status: string; completeness: number | null; flags: unknown } | null;
  const evidence = (detail.evidence ?? []) as unknown as EvidenceRow[];
  const flags = (session?.flags ?? []) as Flag[];
  const decided = detail.status === "hired" || detail.status === "rejected";

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">{person?.full_name ?? "—"}</h2>
          <div className="text-sm text-muted-foreground">{person?.email}{person?.phone ? ` · ${person.phone}` : ""}</div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="gap-1" onClick={openResume}><FileText className="h-3.5 w-3.5" />Resume</Button>
          <a href={`/screen/${applicationId}`} target="_blank" rel="noreferrer"><Button variant="ghost" size="sm" className="gap-1"><ExternalLink className="h-3.5 w-3.5" />Open screen</Button></a>
        </div>
      </div>

      <div className="mt-2 ios-mono text-xs text-muted-foreground">
        stage: {detail.stage} · status: {detail.status}{session?.completeness != null ? ` · evidence ${session.completeness}/100` : ""}
      </div>

      {detail.needs_human_screen && (
        <div className="mt-4 rounded border border-amber-500/40 bg-amber-500/5 p-3 text-sm">Candidate requested a human screen.</div>
      )}

      <EvidenceCards
        evidence={evidence}
        flags={flags}
        emptyState={session?.status === "in_progress" ? "Screening in progress…" : session?.status === "completed" ? "Extracting evidence…" : "Candidate has not started the AI screening interview yet."}
      />

      {!decided && (
        <div className="mt-6 border-t border-border pt-6">
          <div className="ios-eyebrow mb-2">Decision (logged to audit trail)</div>
          <Textarea ref={reasonRef} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required for rejection)…" rows={2} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={onAdvance} disabled={pending}>Advance to shortlist</Button>
            <Button size="sm" variant="outline" onClick={onHire} disabled={pending}>Mark hired</Button>
            <Button size="sm" variant="outline" onClick={onPool} disabled={pending}>Send to pool</Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={onReject} disabled={pending}>Reject</Button>
          </div>
        </div>
      )}
    </div>
  );
}
