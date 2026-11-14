import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { BrainCircuit, FileX2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, StatusBadge, VerdictBadge, DemoBadge } from "./badges";
import { Pipeline } from "./pipeline";
import {
  dashboardStatsQuery, evaluationHistoryQuery, latestRunQuery, memoryQuery, profileQuery, rejectionLogsQuery, rubricQuery, runsQuery,
} from "@/lib/lessoniq/queries";
import { ALLOWED_MODELS, CRITERION_KEYS, CRITERION_NAME, type CriterionKey } from "@/lib/lessoniq/constants";
import { EVALUATOR_SYSTEM_PROMPT, GENERATOR_SYSTEM_PROMPT } from "@/lib/lessoniq/prompts";
import {
  addRubricClarification, decideRecommendation, getSystemStatus, removeGeneratorRule, runFailureAnalysis, updateModelSettings,
} from "@/lib/lessoniq/lessoniq.functions";
import { resolveRubricClient } from "@/lib/lessoniq/rubric-client";

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return <div className="rounded-xl border bg-card p-5 shadow-card">{title && <h3 className="mb-3 text-sm font-semibold">{title}</h3>}{children}</div>;
}

export function DashboardPage() {
  const stats = useQuery(dashboardStatsQuery);
  const runs = useQuery(runsQuery);
  const statusFn = useServerFn(getSystemStatus);
  const status = useQuery({ queryKey: ["system-status"], queryFn: () => statusFn() });
  const latest = useQuery(latestRunQuery);
  const s = stats.data;
  const tiles = [
    ["Total runs", s?.total_runs], ["Approved", s?.approved], ["Rejected", s?.rejected], ["Regenerations", s?.regeneration_attempts],
    ["Avg checkpoints passed", s?.avg_pass_count != null ? `${s.avg_pass_count}/6` : "–"], ["First-try pass rate", s?.first_attempt_pass_rate != null ? `${s.first_attempt_pass_rate}%` : "–"],
  ];
  const fails = Object.entries(s?.failure_counts ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <PageHeader title="Dashboard" description="Live figures from your generation runs, evaluations and rejection logs." />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{tiles.map(([l, v]) => <Card key={l as string}><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 font-display text-2xl font-semibold">{v ?? (stats.isLoading ? "…" : 0)}</div></Card>)}</div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Checkpoint pass rates">{CRITERION_KEYS.map((k) => { const r = s?.criteria_pass_rates?.[k]; return <div key={k} className="mb-2"><div className="flex justify-between text-xs"><span>{CRITERION_NAME[k]}</span><span>{r != null ? `${r}%` : "–"}</span></div><div className="h-1.5 rounded bg-muted"><div className="h-1.5 rounded bg-gradient-brand" style={{ width: `${r ?? 0}%` }} /></div></div>; })}</Card>
        <Card title="Most frequent failure categories">{fails.length ? fails.map(([k, n]) => <div key={k} className="flex justify-between border-b py-1.5 text-sm"><span>{CRITERION_NAME[k as CriterionKey]}</span><span className="font-mono">{n}</span></div>) : <p className="text-sm text-muted-foreground">No failures recorded yet.</p>}</Card>
        <Card title="System status">{status.data ? <ul className="space-y-1.5 text-sm">
          <li>AI API key: {status.data.apiKeyConfigured ? "configured" : <span className="text-destructive">missing</span>}</li>
          <li>AI gateway: {status.data.gatewayOk ? <span className="text-success">connected</span> : <span className="text-destructive">{status.data.gatewayMessage}</span>}</li>
          <li>Database: {status.data.databaseOk ? <span className="text-success">{status.data.databaseMessage}</span> : <span className="text-destructive">{status.data.databaseMessage}</span>}</li>
        </ul> : <p className="text-sm text-muted-foreground">Checking…</p>}</Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Recent generation runs">{runs.data?.length ? runs.data.slice(0, 8).map((r) => <Link key={r.id} to="/runs/$runId" params={{ runId: r.id }} className="flex items-center justify-between gap-2 border-b py-2 text-sm hover:text-brand"><span className="truncate">{r.topic}</span><span className="flex shrink-0 gap-1"><DemoBadge defect={r.demo_defect} /><StatusBadge status={r.status} /></span></Link>) : <p className="text-sm text-muted-foreground">No runs yet. <Link to="/generate" className="text-brand">Generate your first lesson</Link>.</p>}</Card>
        <Card title="Latest run workflow"><Pipeline run={latest.data ?? null} live /></Card>
      </div>
    </div>
  );
}

export function HistoryPage() {
  const { data } = useQuery(evaluationHistoryQuery);
  return (
    <div>
      <PageHeader title="Evaluation History" description="Every evaluation made by the Independent Evaluator Agent." />
      {!data?.length ? <EmptyState icon={History} title="No evaluations yet" description="Evaluations appear here after the first run." /> : (
        <div className="space-y-2">{data.map((e) => { const run = e.generation_runs as unknown as { topic: string; demo_defect: string | null }; const cs = e.evaluation_criteria as unknown as { criterion_key: string; verdict: string }[]; return (
          <Link key={e.id} to="/runs/$runId" params={{ runId: e.run_id }} className="block rounded-xl border bg-card p-4 shadow-card hover:border-brand/40">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-semibold">{run?.topic} <span className="font-mono text-xs text-muted-foreground">attempt {e.attempt_number}</span></div><div className="flex gap-2"><DemoBadge defect={run?.demo_defect ?? null} /><span className="text-xs font-semibold">{e.decision} · {e.pass_count}/6</span></div></div>
            <div className="mt-2 flex flex-wrap gap-1.5">{CRITERION_KEYS.map((k) => { const c = cs.find((x) => x.criterion_key === k); return c ? <span key={k} className="flex items-center gap-1 text-xs">{CRITERION_NAME[k]} <VerdictBadge verdict={c.verdict} size="xs" /></span> : null; })}</div>
            <div className="mt-1 text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
          </Link>); })}</div>)}
    </div>
  );
}

export function RejectionsPage() {
  const { data } = useQuery(rejectionLogsQuery);
  return (
    <div>
      <PageHeader title="Rejection Logs" description="What failed, why, the feedback sent to the generator, what it changed, and what happened next." />
      {!data?.length ? <EmptyState icon={FileX2} title="No rejections yet" description="Failed drafts are logged here." /> : (
        <div className="space-y-3">{data.map((r) => { const run = r.generation_runs as unknown as { topic: string; demo_defect: string | null }; const reasons = r.evaluator_reasoning as unknown as { criterion_name: string; reason: string; evidence: string }[]; return (
          <div key={r.id} className="rounded-xl border bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2"><Link to="/runs/$runId" params={{ runId: r.run_id }} className="font-semibold hover:text-brand">{run?.topic} · attempt {r.attempt_number}</Link><div className="flex gap-2"><DemoBadge defect={run?.demo_defect ?? null} />{r.is_final_rejection && <StatusBadge status="rejected" />}</div></div>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">Run {r.run_id.slice(0, 8)} · {new Date(r.created_at).toLocaleString()}</p>
            <div className="mt-2 space-y-1">{reasons.map((x, i) => <p key={i} className="text-sm"><VerdictBadge verdict="FAIL" size="xs" /> <b>{x.criterion_name}</b>: {x.reason} <span className="text-muted-foreground">Evidence: “{x.evidence}”</span></p>)}</div>
            {r.changes_made?.length ? <div className="mt-2 text-sm"><b>Changes made on retry:</b><ul className="list-disc pl-5 text-muted-foreground">{r.changes_made.map((c, i) => <li key={i}>{c}</li>)}</ul></div> : null}
            {r.result_after_regeneration && <p className="mt-2 text-sm"><b>Result after regeneration:</b> {r.result_after_regeneration}</p>}
          </div>); })}</div>)}
    </div>
  );
}

export function MemoryPage() {
  const { data } = useQuery(memoryQuery);
  const qc = useQueryClient();
  const decide = useServerFn(decideRecommendation);
  const analyze = useServerFn(runFailureAnalysis);
  const removeRule = useServerFn(removeGeneratorRule);
  const refresh = () => qc.invalidateQueries({ queryKey: ["memory"] });
  const active = data?.prompts.find((p) => p.is_active);
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } };
  return (
    <div>
      <PageHeader title="Memory & Learning" description="Persistent memory and failure-pattern analysis. Recommendations only take effect after you approve them." actions={<Button size="sm" variant="outline" onClick={() => act(() => analyze(), "Analysis complete")}>Run analysis now</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Improvement recommendations">{data?.recommendations.length ? data.recommendations.map((r) => (
          <div key={r.id} className="mb-3 rounded-lg border p-3 text-sm">
            <div className="flex justify-between gap-2"><b>{CRITERION_NAME[r.criterion_key as CriterionKey]} · {r.target === "generator_prompt" ? "Generator prompt" : "Evaluator rubric"}</b><span className="text-xs">{r.status} · {r.occurrences}×</span></div>
            <p className="mt-1">{r.proposed_change}</p><p className="mt-1 text-xs text-muted-foreground">{r.rationale}</p>
            {r.status === "approved" && <p className="mt-1 text-xs">Effect: {r.failures_before} failures before ({r.runs_before} evals) → {r.failures_after} after ({r.runs_after} evals)</p>}
            {r.status === "pending" && <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => act(() => decide({ data: { id: r.id, approve: true } }), "Approved – new version created")}>Approve</Button><Button size="sm" variant="outline" onClick={() => act(() => decide({ data: { id: r.id, approve: false } }), "Dismissed")}>Dismiss</Button></div>}
          </div>)) : <p className="text-sm text-muted-foreground">Recommendations appear once a failure category repeats.</p>}</Card>
        <Card title={`Active generator prompt v${active?.version ?? 1} – learned rules`}>{active?.learned_rules.length ? active.learned_rules.map((rule, i) => <div key={i} className="mb-2 flex justify-between gap-2 text-sm"><span>{i + 1}. {rule}</span><Button size="sm" variant="ghost" onClick={() => act(() => removeRule({ data: { index: i } }), "Rule removed")}>Remove</Button></div>) : <p className="text-sm text-muted-foreground">No learned rules yet.</p>}
          <h4 className="mb-1 mt-4 text-xs font-semibold">Prompt version audit trail</h4>{data?.prompts.map((p) => <p key={p.id} className="text-xs text-muted-foreground">v{p.version} · {new Date(p.created_at).toLocaleString()} · {p.change_reason}</p>)}</Card>
      </div>
      <div className="mt-4"><Card title="Stored memory">{data?.memory.length ? data.memory.map((m) => <p key={m.id} className="border-b py-1.5 text-sm"><span className="mr-2 font-mono text-[11px] text-brand">{m.memory_type}</span>{m.content}</p>) : <EmptyState icon={BrainCircuit} title="Memory is empty" description="Each completed run writes outcomes, failure patterns and fixes here." />}</Card></div>
    </div>
  );
}

export function WorkflowPage() {
  const latestQ = useQuery(latestRunQuery);
  const lr = (latestQ.data ?? null) as import("@/lib/lessoniq/queries").RunRow | null;
  return (
    <div>
      <PageHeader title="Workflow Architecture" description="User input → memory → Generator → Evaluator → decision → regeneration (max 2) → approval or rejection → memory update." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={lr ? `Latest run: ${lr.topic}` : "No runs yet"}>{lr && <div className="mb-3 flex gap-2"><StatusBadge status={lr.status} /><span className="text-xs text-muted-foreground">attempts {lr.attempts_used}/{lr.max_attempts}</span></div>}<Pipeline run={lr} live /></Card>
        <div className="space-y-4"><Card title="Generator Agent system prompt"><pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{GENERATOR_SYSTEM_PROMPT}</pre></Card><Card title="Independent Evaluator Agent system prompt"><pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{EVALUATOR_SYSTEM_PROMPT}</pre></Card></div>
      </div>
    </div>
  );
}

export function RubricPage() {
  const { data } = useQuery(rubricQuery);
  const qc = useQueryClient();
  const add = useServerFn(addRubricClarification);
  const [text, setText] = useState<Record<string, string>>({});
  const active = data?.rubrics.find((r) => r.is_active);
  const rubric = resolveRubricClient(active?.criteria ?? null);
  return (
    <div>
      <PageHeader title="Rubric Settings" description={`Six mandatory binary checkpoints (rubric v${active?.version ?? 1}). Clarifications can be added; checkpoints and pass bars cannot be removed or weakened.`} />
      <div className="grid gap-4 md:grid-cols-2">{rubric.map((c) => (
        <Card key={c.key} title={`${c.letter}. ${c.name}`}>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">{c.checks.map((q) => <li key={q}>{q}</li>)}</ul>
          <p className="mt-2 text-xs"><b>Pass bar:</b> {c.passBar}</p>
          {c.clarifications.map((cl, i) => <p key={i} className="mt-1 text-xs text-brand">+ {cl}</p>)}
          <div className="mt-3 flex gap-2"><Input placeholder="Add clarification" value={text[c.key] ?? ""} onChange={(e) => setText({ ...text, [c.key]: e.target.value })} />
            <Button size="sm" onClick={async () => { try { await add({ data: { criterionKey: c.key, text: text[c.key] ?? "" } }); toast.success("New rubric version created"); setText({ ...text, [c.key]: "" }); qc.invalidateQueries({ queryKey: ["rubric"] }); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }}>Add</Button></div>
        </Card>))}</div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Rubric version history">{data?.rubrics.map((r) => <p key={r.id} className="text-xs text-muted-foreground">v{r.version} · {new Date(r.created_at).toLocaleString()} · {r.change_reason}</p>)}</Card>
        <Card title="Reference knowledge (grounding for Accuracy)">{data?.references.map((r) => <p key={r.id} className="border-b py-1.5 text-xs"><b>{r.title}</b> — {r.content}</p>)}</Card>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const statusFn = useServerFn(getSystemStatus);
  const status = useQuery({ queryKey: ["system-status"], queryFn: () => statusFn() });
  const me = useQuery(profileQuery);
  const save = useServerFn(updateModelSettings);
  const qc = useQueryClient();
  const [gen, setGen] = useState<string | null>(null);
  const [ev, setEv] = useState<string | null>(null);
  const g = gen ?? me.data?.profile?.generator_model ?? "openai/gpt-6-astra";
  const e = ev ?? me.data?.profile?.evaluator_model ?? "openai/gpt-6-astra";
  const sel = (v: string, set: (s: string) => void) => <select className="mt-1 w-full rounded-md border bg-background p-2 text-sm" value={v} onChange={(x) => set(x.target.value)}>{ALLOWED_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.note}</option>)}</select>;
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="API Settings" description="AI keys are stored as server-side secrets and are never sent to the browser." />
      <Card title="Connection status">{status.data ? <ul className="space-y-1 text-sm">
        <li>LLM provider: {status.data.provider}</li>
        <li>API key: {status.data.apiKeyConfigured ? "configured (server secret)" : <span className="text-destructive">NOT configured – AI generation is unavailable</span>}</li>
        <li>API connection: {status.data.gatewayOk ? <span className="text-success">connected</span> : <span className="text-destructive">{status.data.gatewayMessage}</span>}</li>
        <li>Database: {status.data.databaseMessage}</li>
        <li>Current prompt version: v{me.data?.promptVersion ?? 1} · Current rubric version: v{me.data?.rubricVersion ?? 1}</li>
      </ul> : <p className="text-sm text-muted-foreground">Checking…</p>}</Card>
      <Card title="Models">
        <label className="text-sm">Generator Agent model</label>{sel(g, setGen)}
        <label className="mt-3 block text-sm">Evaluator Agent model</label>{sel(e, setEv)}
        <Button className="mt-4" onClick={async () => { try { await save({ data: { generatorModel: g, evaluatorModel: e } }); toast.success("Saved"); qc.invalidateQueries({ queryKey: ["profile"] }); } catch (x) { toast.error(x instanceof Error ? x.message : "Failed"); } }}>Save</Button>
      </Card>
    </div>
  );
}
