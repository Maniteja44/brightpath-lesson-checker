import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { FlaskConical, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/lessoniq/badges";
import { useRunEngine } from "@/components/lessoniq/run-engine";
import { startGenerationRun } from "@/lib/lessoniq/lessoniq.functions";
import { DEFAULT_LEVEL, DEFAULT_TOPIC, DEMO_DEFECTS, DEMO_DEFECT_KEYS, DIFFICULTIES, type DemoDefect } from "@/lib/lessoniq/constants";

export const Route = createFileRoute("/_authenticated/generate")({
  head: () => ({ meta: [{ title: "Generate Lesson – LessonIQ" }, { name: "description", content: "Start an agentic lesson generation run." }, { property: "og:title", content: "Generate Lesson – LessonIQ" }, { property: "og:description", content: "Start an agentic lesson generation run." }] }),
  component: GeneratePage,
});

function GeneratePage() {
  const start = useServerFn(startGenerationRun);
  const engine = useRunEngine();
  const navigate = useNavigate();
  const [topic, setTopic] = useState(DEFAULT_TOPIC);
  const [level, setLevel] = useState(DEFAULT_LEVEL);
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]>("simple");
  const [objectives, setObjectives] = useState("");
  const [demo, setDemo] = useState(false);
  const [defect, setDefect] = useState<DemoDefect>("unexplained_jargon");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await start({ data: { topic, educationLevel: level, difficulty, objectives: objectives || null, demoDefect: demo ? defect : null } });
      engine.drive(res.runId);
      navigate({ to: "/runs/$runId", params: { runId: res.runId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the run.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Generate a lesson" description="The Generator Agent writes a draft, the Independent Evaluator judges six PASS/FAIL checkpoints, and failed drafts are regenerated (max 2 retries)." />
      <form onSubmit={submit} className="space-y-5 rounded-xl border bg-card p-6 shadow-card">
        <div><Label>Topic</Label><Input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} required /></div>
        <div><Label>Learner education level</Label><Input value={level} onChange={(e) => setLevel(e.target.value)} maxLength={300} required /></div>
        <div><Label>Explanation difficulty</Label>
          <div className="mt-1 flex gap-2">{DIFFICULTIES.map((d) => <Button key={d} type="button" variant={d === difficulty ? "default" : "outline"} size="sm" onClick={() => setDifficulty(d)}>{d}</Button>)}</div>
        </div>
        <div><Label>Learning objectives (optional)</Label><Textarea value={objectives} onChange={(e) => setObjectives(e.target.value)} maxLength={1500} placeholder="e.g. Understand why AI needs to look things up before answering" /></div>
        <div className="rounded-lg border border-warning/40 bg-warning-soft p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold text-warning-foreground"><FlaskConical className="h-4 w-4" />Demonstration mode (controlled test)</div>
            <Switch checked={demo} onCheckedChange={setDemo} />
          </div>
          <p className="mt-1 text-xs text-warning-foreground/80">Injects a known defect into the first draft only. The evaluator is not told; it must detect it, and the generator must fix it.</p>
          {demo && <div className="mt-3 grid gap-2 sm:grid-cols-2">{DEMO_DEFECT_KEYS.map((k) => (
            <button type="button" key={k} onClick={() => setDefect(k)} className={`rounded-md border bg-card p-3 text-left text-sm ${defect === k ? "border-brand ring-2 ring-brand/30" : ""}`}>
              <div className="font-semibold">{DEMO_DEFECTS[k].label}</div><div className="text-xs text-muted-foreground">{DEMO_DEFECTS[k].description}</div>
            </button>))}</div>}
        </div>
        <Button type="submit" disabled={busy} className="bg-gradient-brand shadow-elevated"><Sparkles className="h-4 w-4" />{busy ? "Starting…" : "Start agentic generation"}</Button>
      </form>
    </div>
  );
}
