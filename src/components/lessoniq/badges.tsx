import { CheckCircle2, CircleAlert, Loader2, XCircle, FlaskConical, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEMO_DEFECTS, type DemoDefect } from "@/lib/lessoniq/constants";

const STATUS: Record<string, { label: string; cls: string; icon: "ok" | "bad" | "warn" | "spin" | "wait" }> = {
  approved: { label: "Approved", cls: "bg-success-soft text-success border-success/30", icon: "ok" },
  rejected: { label: "Rejected", cls: "bg-danger-soft text-destructive border-destructive/30", icon: "bad" },
  failed: { label: "Failed", cls: "bg-danger-soft text-destructive border-destructive/30", icon: "bad" },
  needs_improvement: { label: "Needs improvement", cls: "bg-warning-soft text-warning-foreground border-warning/40", icon: "warn" },
  generating: { label: "Generating", cls: "bg-brand-soft text-accent-foreground border-brand/30", icon: "spin" },
  evaluating: { label: "Evaluating", cls: "bg-brand-soft text-accent-foreground border-brand/30", icon: "spin" },
  pending: { label: "Queued", cls: "bg-muted text-muted-foreground border-border", icon: "wait" },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] ?? STATUS["pending"]!;
  const Icon = s.icon === "ok" ? CheckCircle2 : s.icon === "bad" ? XCircle : s.icon === "warn" ? CircleAlert : s.icon === "spin" ? Loader2 : Clock;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", s.cls, className)}>
      <Icon className={cn("h-3.5 w-3.5", s.icon === "spin" && "animate-spin")} />
      {s.label}
    </span>
  );
}

export function VerdictBadge({ verdict, size = "sm" }: { verdict: "PASS" | "FAIL" | string; size?: "sm" | "xs" }) {
  const pass = verdict === "PASS";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border font-mono font-semibold tracking-wide",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-1.5 py-px text-[10px]",
        pass ? "border-success/30 bg-success-soft text-success" : "border-destructive/30 bg-danger-soft text-destructive",
      )}
    >
      {pass ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {pass ? "PASS" : "FAIL"}
    </span>
  );
}

export function DemoBadge({ defect }: { defect: string | null }) {
  if (!defect) return null;
  const d = DEMO_DEFECTS[defect as DemoDefect];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning-foreground">
      <FlaskConical className="h-3.5 w-3.5" />
      Controlled test{d ? `: ${d.label}` : ""}
    </span>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-foreground sm:text-[1.7rem]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-14 text-center">
      <div className="mb-3 rounded-full bg-brand-soft p-3 text-brand">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
