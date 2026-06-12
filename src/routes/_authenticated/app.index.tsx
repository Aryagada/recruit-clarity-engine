import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyJobs, updateJobStatus } from "@/lib/jobs.functions";
import { Button } from "@/components/ui/button";
import { Plus, ExternalLink, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Roles · Interview OS" }] }),
  component: AppDashboard,
});

function AppDashboard() {
  const fetchJobs = useServerFn(listMyJobs);
  const updateStatus = useServerFn(updateJobStatus);
  const navigate = useNavigate();
  const { data: jobs, refetch, isLoading } = useQuery({ queryKey: ["jobs"], queryFn: () => fetchJobs(), staleTime: 30_000 });
  const publish = useMutation({
    mutationFn: (jobId: string) => updateStatus({ data: { jobId, status: "open" } }),
    onSuccess: () => { toast.success("Role is now open for applications"); refetch(); },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <div className="ios-eyebrow">Roles</div>
          <h1 className="mt-1 text-2xl font-semibold">Your open positions</h1>
        </div>
        <Button onClick={() => navigate({ to: "/app/jobs/new" })} className="gap-2"><Plus className="h-4 w-4" />New role</Button>
      </div>
      <div className="mt-8 rounded-lg border border-border bg-card">
        {isLoading ? <div className="p-12 text-center text-muted-foreground">Loading…</div> :
          !jobs || jobs.length === 0 ? (
          <div className="p-16 text-center">
            <div className="ios-eyebrow">Empty</div>
            <h3 className="mt-2 text-lg font-semibold">No roles yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Create your first role — AI drafts the rubric in seconds.</p>
            <Button className="mt-6 gap-2" onClick={() => navigate({ to: "/app/jobs/new" })}><Plus className="h-4 w-4" />New role</Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {jobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <Link to="/app/jobs/$jobId" params={{ jobId: j.id }} className="text-base font-medium hover:underline">
                    {j.title}
                  </Link>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className={`ios-mono rounded px-1.5 py-0.5 ${j.status === "open" ? "bg-accent/10 text-accent" : "bg-muted"}`}>{j.status}</span>
                    <span>{new Date(j.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {j.status === "draft" && (
                    <Button size="sm" variant="outline" onClick={() => publish.mutate(j.id)}>Publish</Button>
                  )}
                  {j.status === "open" && (
                    <a href={`/apply/${j.id}`} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost" className="gap-1"><ExternalLink className="h-3.5 w-3.5" />Apply link</Button>
                    </a>
                  )}
                  <Link to="/app/jobs/$jobId" params={{ jobId: j.id }}>
                    <Button size="sm" variant="ghost" className="gap-1"><Users className="h-3.5 w-3.5" />Pipeline</Button>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
