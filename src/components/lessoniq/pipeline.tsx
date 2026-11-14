import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { WORKFLOW_STEPS, type StepLogEntry } from "@/lib/lessoniq/constants";
import type { RunRow } from "@/lib/lessoniq/queries";

export function Pipeline({ run, live }: { run: RunRow | null; live?: boolean }) {
  const log = (run?.step_log ?? []) as unknown as StepLogEntry[];
  return (
    <ol className="space-y-2">
      {WORKFLOW_STEPS.map((s, i) => {
        const entries = log.filter((e) => e.step === s.key);
        const last = entries[entries.length - 1];
        const running = live && run?.current_step === s.key && !["approved", "rejected", "failed"].includes(run.status);
        const state = running ? "running" : last?.status ?? "idle";
        return (
          <li key={s.key} className={cn("flex items-start gap-3 rounded-lg border bg-card p-3", state === "running" && "border-brand/50 bg-brand-soft")}>
            <div className={cn("mt-0.5 rounded-full", state === "running" && "animate-pulse-ring")}>
              {state === "done" ? <CheckCircle2 className="h-5 w-5 text-success" /> : state === "failed" ? <XCircle className="h-5 w-5 text-destructive" /> : state === "running" ? <Loader2 className="h-5 w-5 animate-spin text-brand" /> : <Circle className="h-5 w-5 text-muted-foreground/50" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span className="text-muted-foreground">{i + 1}.</span>{s.label}{last && <span className="font-mono text-[11px] font-normal text-muted-foreground">attempt {last.attempt} · {new Date(last.at).toLocaleTimeString()}</span>}</div>
              {entries.slice(-3).map((e, j) => e.detail && <p key={j} className="mt-0.5 text-xs text-muted-foreground">{e.detail}</p>)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
