import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type RunRow = Database["public"]["Tables"]["generation_runs"]["Row"];
export type LessonVersionRow = Database["public"]["Tables"]["lesson_versions"]["Row"];
export type EvaluationRow = Database["public"]["Tables"]["evaluations"]["Row"];
export type CriterionRow = Database["public"]["Tables"]["evaluation_criteria"]["Row"];
export type RejectionLogRow = Database["public"]["Tables"]["rejection_logs"]["Row"];
export type MemoryRow = Database["public"]["Tables"]["agent_memory"]["Row"];
export type RecommendationRow = Database["public"]["Tables"]["improvement_recommendations"]["Row"];
export type PromptVersionRow = Database["public"]["Tables"]["prompt_versions"]["Row"];
export type RubricVersionRow = Database["public"]["Tables"]["rubric_versions"]["Row"];
export type ReferenceRow = Database["public"]["Tables"]["reference_knowledge"]["Row"];

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export interface DashboardStats {
  total_runs: number;
  approved: number;
  rejected: number;
  failed: number;
  in_progress: number;
  regeneration_attempts: number;
  total_evaluations: number;
  avg_pass_count: number | null;
  first_attempt_pass_rate: number | null;
  criteria_pass_rates: Record<string, number>;
  failure_counts: Record<string, number>;
}

export const dashboardStatsQuery = queryOptions({
  queryKey: ["dashboard-stats"],
  queryFn: async () => check(await supabase.rpc("dashboard_stats")) as unknown as DashboardStats,
});

export const runsQuery = queryOptions({
  queryKey: ["runs"],
  queryFn: async () =>
    check(
      await supabase
        .from("generation_runs")
        .select("id, topic, status, attempts_used, demo_defect, created_at, completed_at, current_step, error_message")
        .order("created_at", { ascending: false })
        .limit(100),
    ),
});

export const latestRunQuery = queryOptions({
  queryKey: ["latest-run"],
  refetchInterval: 3000,
  queryFn: async () =>
    check(await supabase.from("generation_runs").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle()),
});

export interface RunBundle {
  run: RunRow;
  versions: LessonVersionRow[];
  evaluations: EvaluationRow[];
  criteria: CriterionRow[];
  rejections: RejectionLogRow[];
}

export const runBundleQuery = (runId: string) =>
  queryOptions({
    queryKey: ["run", runId],
    queryFn: async (): Promise<RunBundle> => {
      const [run, versions, evaluations, criteria, rejections] = await Promise.all([
        supabase.from("generation_runs").select("*").eq("id", runId).maybeSingle(),
        supabase.from("lesson_versions").select("*").eq("run_id", runId).order("attempt_number"),
        supabase.from("evaluations").select("*").eq("run_id", runId).order("attempt_number"),
        supabase.from("evaluation_criteria").select("*").eq("run_id", runId),
        supabase.from("rejection_logs").select("*").eq("run_id", runId).order("attempt_number"),
      ]);
      const r = check(run);
      if (!r) throw new Error("Run not found");
      return {
        run: r,
        versions: check(versions) ?? [],
        evaluations: check(evaluations) ?? [],
        criteria: check(criteria) ?? [],
        rejections: check(rejections) ?? [],
      };
    },
  });

export const evaluationHistoryQuery = queryOptions({
  queryKey: ["evaluation-history"],
  queryFn: async () =>
    check(
      await supabase
        .from("evaluations")
        .select("*, generation_runs(topic, demo_defect, status), evaluation_criteria(criterion_key, verdict, reason)")
        .order("created_at", { ascending: false })
        .limit(150),
    ),
});

export const rejectionLogsQuery = queryOptions({
  queryKey: ["rejection-logs"],
  queryFn: async () =>
    check(
      await supabase
        .from("rejection_logs")
        .select("*, generation_runs(topic, demo_defect, status)")
        .order("created_at", { ascending: false })
        .limit(150),
    ),
});

export const memoryQuery = queryOptions({
  queryKey: ["memory"],
  queryFn: async () => {
    const [memory, recs, prompts] = await Promise.all([
      supabase.from("agent_memory").select("*").order("updated_at", { ascending: false }).limit(200),
      supabase.from("improvement_recommendations").select("*").order("created_at", { ascending: false }),
      supabase.from("prompt_versions").select("*").eq("role", "generator").order("version", { ascending: false }),
    ]);
    return { memory: check(memory) ?? [], recommendations: check(recs) ?? [], prompts: check(prompts) ?? [] };
  },
});

export const rubricQuery = queryOptions({
  queryKey: ["rubric"],
  queryFn: async () => {
    const [rubrics, refs] = await Promise.all([
      supabase.from("rubric_versions").select("*").order("version", { ascending: false }),
      supabase.from("reference_knowledge").select("*").order("created_at"),
    ]);
    return { rubrics: check(rubrics) ?? [], references: check(refs) ?? [] };
  },
});

export const profileQuery = queryOptions({
  queryKey: ["profile"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const [profile, prompt, rubric] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
      supabase.from("prompt_versions").select("version").eq("role", "generator").eq("is_active", true).maybeSingle(),
      supabase.from("rubric_versions").select("version").eq("is_active", true).maybeSingle(),
    ]);
    return {
      email: u.user.email ?? "",
      profile: check(profile),
      promptVersion: prompt.data?.version ?? null,
      rubricVersion: rubric.data?.version ?? null,
    };
  },
});
