import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DemoBadge, PageHeader, StatusBadge, VerdictBadge } from "@/components/lessoniq/badges";
import { Pipeline } from "@/components/lessoniq/pipeline";
import { useRunEngine } from "@/components/lessoniq/run-engine";
import { runBundleQuery } from "@/lib/lessoniq/queries";
import { CRITERION_KEYS, CRITERION_NAME, TERMINAL_STATUSES, type RunStatus } from "@/lib/lessoniq/constants";
import { lessonToMarkdown, type Lesson } from "@/lib/lessoniq/lesson";

export const Route = createFileRoute("/_authenticated/runs/$runId")({
  head: () => ({ meta: [{ title: "Generation run – LessonIQ" }, { name: "description", content: "Live agentic generation run." }, { property: "og:title", content: "Generation run – LessonIQ" }, { property: "og:description", content: "Live agentic generation run." }] }),
  component: RunPage,
});

function RunPage() {
  const { runId } = Route.useParams();
  const engine = useRunEngine();
  const { data, isLoading, error } = useQuery({ ...runBundleQuery(runId), refetchInterval: (q) => (q.state.data && !TERMINAL_STATUSES.includes(q.state.data.run.status as RunStatus) ? 2500 : false) });
  if (isLoading) return <p className="text-muted-foreground">Loading run…</p>;
  if (error || !data) return <p className="text-destructive">Could not load this run.</p>;
  const { run, versions, evaluations, criteria } = data;
  const terminal = TERMINAL_STATUSES.includes(run.status as RunStatus);
  const driving = engine.isDriving(runId);
  const final = versions.find((v) => v.id === run.final_lesson_version_id);
  const shown = final ?? versions[versions.length - 1];

  function exportMd() {
    if (!final) return;
    const blob = new Blob([lessonToMarkdown(final.content as unknown as Lesson)], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${run.topic.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
    a.click();
  }

  return (
    <div>
      <PageHeader title={run.topic} description={`Attempts used: ${run.attempts_used} of ${run.max_attempts} · Generator ${run.generator_model} · Evaluator ${run.evaluator_model}`}
        actions={<>
          <StatusBadge status={run.status} /><DemoBadge defect={run.demo_defect} />
          {!terminal && !driving && <Button size="sm" onClick={() => engine.drive(runId)}><Play className="h-4 w-4" />Resume</Button>}
          {final && <Button size="sm" variant="outline" onClick={exportMd}><Download className="h-4 w-4" />Export Markdown</Button>}
        </>} />
      {(run.error_message || engine.lastError(runId)) && !driving && <div className="mb-4 rounded-lg border border-destructive/30 bg-danger-soft p-3 text-sm text-destructive">{engine.lastError(runId) ?? run.error_message}</div>}
      {run.status === "rejected" && <div className="mb-4 rounded-lg border border-destructive/30 bg-danger-soft p-3 text-sm text-destructive">{run.rejection_explanation}</div>}
      <Tabs defaultValue="progress">
        <TabsList><TabsTrigger value="progress">Progress</TabsTrigger><TabsTrigger value="lesson">Lesson</TabsTrigger><TabsTrigger value="compare">Compare attempts</TabsTrigger></TabsList>
        <TabsContent value="progress" className="mt-4"><Pipeline run={run} live /></TabsContent>
        <TabsContent value="lesson" className="mt-4">
          {!shown ? <p className="text-muted-foreground">No draft yet.</p> : (
            <div className="rounded-xl border bg-card p-6 shadow-card">
              {final ? <div className="mb-4 rounded-md bg-success-soft p-2 text-sm font-semibold text-success">Approved lesson — passed all six checkpoints</div> : <div className="mb-4 rounded-md bg-warning-soft p-2 text-sm font-semibold text-warning-foreground">NOT APPROVED — draft {shown.attempt_number} shown for review only</div>}
              <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed">{shown.markdown}</pre>
            </div>)}
        </TabsContent>
        <TabsContent value="compare" className="mt-4 overflow-x-auto">
          <table className="w-full rounded-xl border bg-card text-sm">
            <thead><tr className="border-b"><th className="p-2 text-left">Checkpoint</th>{evaluations.map((e) => <th key={e.id} className="p-2 text-left">Attempt {e.attempt_number}</th>)}</tr></thead>
            <tbody>{CRITERION_KEYS.map((k) => (
              <tr key={k} className="border-b align-top"><td className="p-2 font-medium">{CRITERION_NAME[k]}</td>
                {evaluations.map((e) => { const c = criteria.find((x) => x.evaluation_id === e.id && x.criterion_key === k); return <td key={e.id} className="p-2">{c && <><VerdictBadge verdict={c.verdict} /><p className="mt-1 text-xs text-muted-foreground">{c.reason}</p></>}</td>; })}
              </tr>))}</tbody>
          </table>
          <div className="mt-4 grid gap-3 md:grid-cols-3">{versions.map((v) => <div key={v.id} className="rounded-lg border bg-card p-3 text-sm"><div className="font-semibold">Attempt {v.attempt_number}{v.injected_defect && <span className="ml-2 text-xs text-warning-foreground">defect injected: {v.injected_defect}</span>}</div>{v.revision_notes.length ? <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">{v.revision_notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : <p className="text-xs text-muted-foreground">First draft</p>}</div>)}</div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
