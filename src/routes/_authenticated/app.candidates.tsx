import { createFileRoute } from "@tanstack/react-router";
import { PipelineConsole } from "@/components/PipelineConsole";

export const Route = createFileRoute("/_authenticated/app/candidates")({
  head: () => ({ meta: [{ title: "Candidates · Interview OS" }] }),
  component: CandidatesConsole,
});

// Global shortlist console: the shared PipelineConsole with no role lock, so it
// spans every role in the org and shows the role filter.
function CandidatesConsole() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <div className="ios-eyebrow">Candidates</div>
          <h1 className="mt-1 text-2xl font-semibold">Shortlist console</h1>
        </div>
      </div>
      <div className="mt-6">
        <PipelineConsole />
      </div>
    </div>
  );
}
