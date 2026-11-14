// Server-only agentic workflow engine. Every state transition, the retry budget
// and the approval rule are enforced here; the browser can only ask to "advance".
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  ALLOWED_MODEL_IDS,
  BASE_RUBRIC,
  CRITERION_KEYS,
  CRITERION_NAME,
  DEFAULT_MODEL,
  GENERATOR_RULE_FOR,
  MAX_ATTEMPTS,
  RECOMMENDATION_THRESHOLD,
  RUBRIC_CLARIFICATION_FOR,
  RUNS_PER_HOUR_LIMIT,
  TERMINAL_STATUSES,
  type CriterionDefinition,
  type CriterionKey,
  type DemoDefect,
  type RunStatus,
  type StepLogEntry,
  type WorkflowStepKey,
} from "./constants";
import {
  buildFeedback,
  decide,
  injectDefect,
  lessonSchema,
  lessonToMarkdown,
  nextAttemptNumber,
  validateEvaluation,
  evaluatorOutputSchema,
  type Lesson,
} from "./lesson";
import {
  EVALUATOR_SYSTEM_PROMPT,
  buildEvaluatorInput,
  buildGeneratorSystem,
  buildInitialGeneratorInput,
  buildRegenerationInput,
  type GeneratorRequest,
} from "./prompts";
import { LlmError, callStructured } from "./llm.server";

type Admin = SupabaseClient<Database>;
type RunRow = Database["public"]["Tables"]["generation_runs"]["Row"];

export class WorkflowError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const LOCK_MS = 6 * 60 * 1000;
const MAX_MALFORMED_EVALUATIONS = 3;

function nowIso() {
  return new Date().toISOString();
}

function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error) {
    console.error(`[lessoniq] DB error (${what}):`, res.error.message);
    throw new WorkflowError("database_error", `Database error while ${what}. Please retry.`);
  }
  if (res.data === null) throw new WorkflowError("not_found", `Not found: ${what}.`);
  return res.data as NonNullable<T>;
}

// ---------------------------------------------------------------- setup

export async function ensureUserSetup(admin: Admin, userId: string) {
  const profileRes = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
  let profile = profileRes.data;
  if (!profile) {
    profile = must(
      await admin.from("profiles").upsert({ id: userId }).select("*").single(),
      "creating profile",
    );
  }

  const ensurePrompt = async (role: "generator" | "evaluator") => {
    const existing = await admin
      .from("prompt_versions")
      .select("*")
      .eq("user_id", userId)
      .eq("role", role)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing.data) return existing.data;
    return must(
      await admin
        .from("prompt_versions")
        .insert({
          user_id: userId,
          role,
          version: 1,
          learned_rules: [],
          change_reason: "Initial base prompt",
          is_active: true,
        })
        .select("*")
        .single(),
      `creating ${role} prompt`,
    );
  };

  const generatorPrompt = await ensurePrompt("generator");
  const evaluatorPrompt = await ensurePrompt("evaluator");

  const rubricRes = await admin
    .from("rubric_versions")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const rubric =
    rubricRes.data ??
    must(
      await admin
        .from("rubric_versions")
        .insert({
          user_id: userId,
          version: 1,
          criteria: BASE_RUBRIC as unknown as Json,
          change_reason: "Initial mandatory rubric (6 binary checkpoints)",
          is_active: true,
        })
        .select("*")
        .single(),
      "creating rubric",
    );

  return { profile, generatorPrompt, evaluatorPrompt, rubric };
}

/** Mandatory checkpoints always come from code; stored versions can only add clarifications. */
export function resolveRubric(stored: Json): CriterionDefinition[] {
  const list = Array.isArray(stored) ? (stored as unknown as Partial<CriterionDefinition>[]) : [];
  return BASE_RUBRIC.map((base) => {
    const found = list.find((c) => c?.key === base.key);
    const clar = Array.isArray(found?.clarifications)
      ? found!.clarifications.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
    return { ...base, clarifications: clar };
  });
}

// ---------------------------------------------------------------- memory retrieval

function topicWords(topic: string) {
  return Array.from(
    new Set(
      topic
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !["the", "and", "for", "introduction", "with", "what"].includes(w)),
    ),
  );
}

export async function retrieveMemory(admin: Admin, userId: string, topic: string) {
  const words = topicWords(topic);
  const [outcomes, patterns, improvements, feedback] = await Promise.all([
    admin.from("agent_memory").select("*").eq("user_id", userId).eq("memory_type", "topic_outcome").order("created_at", { ascending: false }).limit(50),
    admin.from("agent_memory").select("*").eq("user_id", userId).eq("memory_type", "failure_pattern").order("occurrences", { ascending: false }).limit(6),
    admin.from("agent_memory").select("*").eq("user_id", userId).eq("memory_type", "successful_improvement").order("created_at", { ascending: false }).limit(5),
    admin.from("agent_memory").select("*").eq("user_id", userId).eq("memory_type", "user_feedback").order("created_at", { ascending: false }).limit(3),
  ]);
  const similar = (outcomes.data ?? [])
    .filter((m) => words.some((w) => (m.topic ?? "").toLowerCase().includes(w)))
    .slice(0, 4);
  const lines: string[] = [];
  if (similar.length) {
    lines.push("Past outcomes for similar topics:");
    for (const m of similar) lines.push(`- ${m.content}`);
  }
  const pats = (patterns.data ?? []).filter((p) => p.occurrences > 0);
  if (pats.length) {
    lines.push("Recurring failure patterns to avoid (most frequent first):");
    for (const p of pats) lines.push(`- ${p.content}`);
  }
  if (improvements.data?.length) {
    lines.push("Fixes that previously turned a FAIL into a PASS:");
    for (const m of improvements.data) lines.push(`- ${m.content}`);
  }
  if (feedback.data?.length) {
    lines.push("Recent human feedback on lessons:");
    for (const m of feedback.data) lines.push(`- ${m.content}`);
  }
  return {
    context: lines.join("\n"),
    snapshot: {
      similar_outcomes: similar.length,
      failure_patterns: pats.length,
      successful_improvements: improvements.data?.length ?? 0,
      user_feedback: feedback.data?.length ?? 0,
      retrieved_at: nowIso(),
    },
  };
}

async function loadReferenceKnowledge(admin: Admin, userId: string, topic: string) {
  const res = await admin
    .from("reference_knowledge")
    .select("*")
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .limit(200);
  const t = topic.toLowerCase();
  const matches = (res.data ?? []).filter((r) => r.keywords.some((k) => t.includes(k.toLowerCase())));
  if (!matches.length) {
    return {
      count: 0,
      text: "No reference knowledge is configured for this topic. Judge accuracy against well-established knowledge, and FAIL accuracy for any specific claim (numbers, dates, names, research results) you cannot verify.",
    };
  }
  return {
    count: matches.length,
    text: matches.map((r, i) => `[R${i + 1}] ${r.title}: ${r.content}${r.source ? ` (Source: ${r.source})` : ""}`).join("\n"),
  };
}

// ---------------------------------------------------------------- start

export interface StartInput {
  topic: string;
  educationLevel: string;
  difficulty: string;
  objectives: string | null;
  demoDefect: DemoDefect | null;
}

export async function startRun(admin: Admin, userId: string, input: StartInput) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await admin
    .from("generation_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if ((recent.count ?? 0) >= RUNS_PER_HOUR_LIMIT) {
    throw new WorkflowError("rate_limited", `Rate limit: at most ${RUNS_PER_HOUR_LIMIT} generation runs per hour. Please wait and try again.`);
  }

  const setup = await ensureUserSetup(admin, userId);
  const generatorModel = setup.profile.generator_model || DEFAULT_MODEL;
  const evaluatorModel = setup.profile.evaluator_model || DEFAULT_MODEL;
  if (!ALLOWED_MODEL_IDS.includes(generatorModel) || !ALLOWED_MODEL_IDS.includes(evaluatorModel)) {
    throw new WorkflowError("invalid_model", "The configured model is not supported. Choose a model in API Settings.");
  }
  if (!process.env["LOVABLE_API_KEY"]) {
    throw new WorkflowError("missing_api_key", "AI is not configured: LOVABLE_API_KEY is missing on the server. See API Settings.");
  }

  const memory = await retrieveMemory(admin, userId, input.topic);
  const at = nowIso();
  const log: StepLogEntry[] = [
    { step: "input_received", status: "done", attempt: 0, at, ...(input.demoDefect ? { detail: `Controlled test: ${input.demoDefect}` } : {}) },
    {
      step: "memory_retrieval",
      status: "done",
      attempt: 0,
      at,
      detail: memory.context ? `${memory.snapshot.similar_outcomes} similar outcomes, ${memory.snapshot.failure_patterns} failure patterns, ${memory.snapshot.successful_improvements} past fixes` : "No prior memory yet",
    },
  ];
  const run = must(
    await admin
      .from("generation_runs")
      .insert({
        user_id: userId,
        topic: input.topic,
        education_level: input.educationLevel,
        difficulty: input.difficulty,
        learning_objectives: input.objectives,
        demo_defect: input.demoDefect,
        status: "pending",
        current_step: "generation",
        max_attempts: MAX_ATTEMPTS,
        memory_context: memory.context,
        memory_snapshot: memory.snapshot as unknown as Json,
        generator_model: generatorModel,
        evaluator_model: evaluatorModel,
        generator_prompt_version_id: setup.generatorPrompt.id,
        evaluator_prompt_version_id: setup.evaluatorPrompt.id,
        rubric_version_id: setup.rubric.id,
        step_log: log as unknown as Json,
      })
      .select("*")
      .single(),
    "creating run",
  );
  return run;
}

// ---------------------------------------------------------------- advance

function appendLog(run: RunRow, entry: Omit<StepLogEntry, "at">): Json {
  const log = (Array.isArray(run.step_log) ? run.step_log : []) as unknown as StepLogEntry[];
  return [...log, { ...entry, at: nowIso() }] as unknown as Json;
}

async function updateRun(admin: Admin, runId: string, patch: Database["public"]["Tables"]["generation_runs"]["Update"]) {
  return must(await admin.from("generation_runs").update(patch).eq("id", runId).select("*").single(), "updating run");
}

export async function getOwnedRun(admin: Admin, userId: string, runId: string) {
  const res = await admin.from("generation_runs").select("*").eq("id", runId).maybeSingle();
  if (res.error) throw new WorkflowError("database_error", "Database error while loading run.");
  if (!res.data || res.data.user_id !== userId) throw new WorkflowError("not_found", "Run not found.");
  return res.data;
}

export async function advanceRun(admin: Admin, userId: string, runId: string) {
  const run = await getOwnedRun(admin, userId, runId);
  if (TERMINAL_STATUSES.includes(run.status as RunStatus)) return { run, busy: false };

  // Single-flight lock so two tabs can never run the same step twice.
  const now = nowIso();
  const lockRes = await admin
    .from("generation_runs")
    .update({ lock_until: new Date(Date.now() + LOCK_MS).toISOString() })
    .eq("id", runId)
    .or(`lock_until.is.null,lock_until.lt.${now}`)
    .select("*");
  if (lockRes.error) throw new WorkflowError("database_error", "Database error while locking run.");
  const locked = lockRes.data?.[0];
  if (!locked) return { run, busy: true };

  let current: RunRow = locked;
  try {
    if (current.status === "evaluating") {
      current = await evaluateStep(admin, current);
    } else {
      current = await generateStep(admin, current);
    }
    current = await updateRun(admin, runId, { lock_until: null });
    return { run: current, busy: false };
  } catch (error) {
    const isLlm = error instanceof LlmError;
    const code = isLlm ? error.code : error instanceof WorkflowError ? error.code : "unknown";
    const message = error instanceof Error ? error.message : "Unexpected error";
    const terminal = isLlm ? error.terminal : false;
    const fresh = await getOwnedRun(admin, userId, runId);
    const restoreStatus: RunStatus =
      fresh.status === "generating" ? (fresh.attempts_used === 0 ? "pending" : "needs_improvement") : (fresh.status as RunStatus);
    const updated = await updateRun(admin, runId, {
      lock_until: null,
      error_code: code,
      error_message: message,
      status: terminal ? "failed" : restoreStatus,
      completed_at: terminal ? nowIso() : null,
      step_log: appendLog(fresh, {
        step: fresh.current_step as WorkflowStepKey,
        status: "failed",
        attempt: fresh.attempts_used,
        detail: message,
      }),
    });
    return { run: updated, busy: false };
  }
}

async function generateStep(admin: Admin, run: RunRow): Promise<RunRow> {
  const versions = must(
    await admin.from("lesson_versions").select("id, attempt_number, markdown, content").eq("run_id", run.id).order("attempt_number"),
    "loading lesson versions",
  );
  const attempt = nextAttemptNumber(versions.length);
  if (attempt === null) {
    // Retry budget spent - never generate again.
    return finalizeRejected(admin, run, "Retry limit reached.");
  }

  const genPrompt = run.generator_prompt_version_id
    ? (await admin.from("prompt_versions").select("*").eq("id", run.generator_prompt_version_id).maybeSingle()).data
    : null;
  const learnedRules = genPrompt?.learned_rules ?? [];

  run = await updateRun(admin, run.id, {
    status: "generating",
    current_step: attempt === 0 ? "generation" : "regeneration",
    error_message: null,
    error_code: null,
    step_log: appendLog(run, {
      step: attempt === 0 ? "generation" : "regeneration",
      status: "running",
      attempt,
      detail: attempt === 0 ? `Generator (${run.generator_model}) writing first draft` : `Regenerating with evaluator feedback (attempt ${attempt} of ${MAX_ATTEMPTS - 1})`,
    }),
  });

  const req: GeneratorRequest = {
    topic: run.topic,
    educationLevel: run.education_level,
    difficulty: run.difficulty,
    objectives: run.learning_objectives,
    learnedRules,
    memoryContext: run.memory_context ?? "",
  };

  let feedback: string | null = null;
  let previousLog: Database["public"]["Tables"]["rejection_logs"]["Row"] | null = null;
  let input: string;
  if (attempt === 0) {
    input = buildInitialGeneratorInput(req);
  } else {
    const prev = versions[versions.length - 1]!;
    previousLog = (
      await admin.from("rejection_logs").select("*").eq("run_id", run.id).eq("attempt_number", prev.attempt_number).maybeSingle()
    ).data;
    feedback = previousLog?.feedback_sent ?? "Improve the lesson against all six checkpoints.";
    input = buildRegenerationInput(req, prev.markdown, feedback, attempt);
  }

  const { object, latencyMs } = await callStructured<Lesson>({
    model: run.generator_model,
    instructions: buildGeneratorSystem(learnedRules),
    input,
    schema: lessonSchema,
    reasoningEffort: "low",
  });
  const parsed = lessonSchema.safeParse(object);
  if (!parsed.success) throw new LlmError("invalid_json", "The generator returned a lesson that failed validation. Retry this step.", false);

  let lesson = parsed.data;
  if (attempt === 0) lesson = { ...lesson, revision_notes: [] };
  const defect = attempt === 0 && run.demo_defect ? (run.demo_defect as DemoDefect) : null;
  if (defect) lesson = injectDefect(lesson, defect);

  const version = must(
    await admin
      .from("lesson_versions")
      .insert({
        run_id: run.id,
        user_id: run.user_id,
        attempt_number: attempt,
        content: lesson as unknown as Json,
        markdown: lessonToMarkdown(lesson),
        revision_notes: lesson.revision_notes,
        injected_defect: defect,
        feedback_received: feedback,
        model: run.generator_model,
        latency_ms: latencyMs,
      })
      .select("id")
      .single(),
    "saving lesson version",
  );

  if (previousLog) {
    await admin
      .from("rejection_logs")
      .update({ changes_made: lesson.revision_notes, regenerated_lesson_version_id: version.id })
      .eq("id", previousLog.id);
  }

  let log = appendLog(run, {
    step: attempt === 0 ? "generation" : "regeneration",
    status: "done",
    attempt,
    detail: `Draft ${attempt} written in ${(latencyMs / 1000).toFixed(1)}s`,
  });
  if (defect) {
    log = [...(log as unknown as StepLogEntry[]), { step: "lesson_output", status: "done", attempt, at: nowIso(), detail: `CONTROLLED DEFECT INJECTED: ${defect}` }] as unknown as Json;
  } else {
    log = [...(log as unknown as StepLogEntry[]), { step: "lesson_output", status: "done", attempt, at: nowIso() }] as unknown as Json;
  }

  return updateRun(admin, run.id, {
    status: "evaluating",
    current_step: "evaluation",
    attempts_used: attempt + 1,
    step_log: log,
  });
}

async function evaluateStep(admin: Admin, run: RunRow): Promise<RunRow> {
  const version = must(
    await admin.from("lesson_versions").select("*").eq("run_id", run.id).order("attempt_number", { ascending: false }).limit(1).maybeSingle(),
    "loading latest lesson",
  );
  const existing = await admin.from("evaluations").select("id, decision").eq("lesson_version_id", version.id).maybeSingle();
  if (existing.data) {
    // Already evaluated (e.g. a retried request); move the run forward from the stored decision.
    if (existing.data.decision === "APPROVED") {
      return updateRun(admin, run.id, { status: "approved", current_step: "final", final_lesson_version_id: version.id, completed_at: nowIso() });
    }
    if (existing.data.decision === "REJECTED") return finalizeRejected(admin, run, "Retry limit reached.");
    return updateRun(admin, run.id, { status: "needs_improvement", current_step: "regeneration" });
  }

  const rubricRow = run.rubric_version_id
    ? (await admin.from("rubric_versions").select("*").eq("id", run.rubric_version_id).maybeSingle()).data
    : null;
  const rubric = resolveRubric(rubricRow?.criteria ?? (BASE_RUBRIC as unknown as Json));
  const refs = await loadReferenceKnowledge(admin, run.user_id, run.topic);

  run = await updateRun(admin, run.id, {
    current_step: "evaluation",
    error_message: null,
    error_code: null,
    step_log: appendLog(run, {
      step: "evaluation",
      status: "running",
      attempt: version.attempt_number,
      detail: `Evaluator (${run.evaluator_model}) checking 6 checkpoints against ${refs.count} reference facts`,
    }),
  });

  let raw: unknown;
  let latencyMs = 0;
  try {
    const res = await callStructured({
      model: run.evaluator_model,
      instructions: EVALUATOR_SYSTEM_PROMPT,
      input: buildEvaluatorInput(run.topic, rubric, refs.text, version.markdown),
      schema: evaluatorOutputSchema,
      reasoningEffort: "medium",
    });
    raw = res.object;
    latencyMs = res.latencyMs;
  } catch (e) {
    if (e instanceof LlmError && e.code === "invalid_json") raw = null;
    else throw e;
  }

  const validation = validateEvaluation(raw);
  if (!validation.ok) {
    const count = run.evaluator_malformed_count + 1;
    const detail = `Malformed evaluator output rejected (${count}/${MAX_MALFORMED_EVALUATIONS}): ${raw === null ? "invalid JSON" : validation.errors.slice(0, 3).join("; ")}`;
    if (count >= MAX_MALFORMED_EVALUATIONS) {
      return updateRun(admin, run.id, {
        status: "failed",
        evaluator_malformed_count: count,
        error_code: "malformed_evaluator_output",
        error_message: "The evaluator returned malformed results repeatedly, so the lesson could not be judged. It was NOT approved.",
        completed_at: nowIso(),
        step_log: appendLog(run, { step: "evaluation", status: "failed", attempt: version.attempt_number, detail }),
      });
    }
    return updateRun(admin, run.id, {
      evaluator_malformed_count: count,
      step_log: appendLog(run, { step: "evaluation", status: "failed", attempt: version.attempt_number, detail: `${detail}. Re-evaluating.` }),
    });
  }

  const decision = decide(validation.criteria, version.attempt_number);
  const passCount = validation.criteria.filter((c) => c.verdict === "PASS").length;
  const evaluation = must(
    await admin
      .from("evaluations")
      .insert({
        run_id: run.id,
        lesson_version_id: version.id,
        user_id: run.user_id,
        attempt_number: version.attempt_number,
        decision,
        pass_count: passCount,
        fail_count: 6 - passCount,
        overall_notes: validation.overall_notes,
        rubric_version_id: run.rubric_version_id,
        model: run.evaluator_model,
        latency_ms: latencyMs,
      })
      .select("id")
      .single(),
    "saving evaluation",
  );
  must(
    await admin
      .from("evaluation_criteria")
      .insert(
        validation.criteria.map((c) => ({
          evaluation_id: evaluation.id,
          run_id: run.id,
          user_id: run.user_id,
          criterion_key: c.criterion_key,
          criterion_name: c.criterion_name,
          verdict: c.verdict,
          reason: c.reason,
          evidence: c.evidence,
          suggested_improvement: c.suggested_improvement,
        })),
      )
      .select("id"),
    "saving checkpoint results",
  );

  const failed = validation.criteria.filter((c) => c.verdict === "FAIL").map((c) => c.criterion_key);

  // Close the loop on the previous rejection log: what happened after regeneration?
  if (version.attempt_number > 0) {
    const resultText =
      decision === "APPROVED"
        ? "APPROVED - all six checkpoints passed after regeneration."
        : `Still failing: ${failed.map((k) => CRITERION_NAME[k]).join(", ")}`;
    await admin
      .from("rejection_logs")
      .update({ result_after_regeneration: resultText })
      .eq("run_id", run.id)
      .eq("attempt_number", version.attempt_number - 1);
  }

  let log = appendLog(run, {
    step: "evaluation",
    status: "done",
    attempt: version.attempt_number,
    detail: `${passCount}/6 PASS${failed.length ? ` · FAIL: ${failed.map((k) => CRITERION_NAME[k]).join(", ")}` : ""}`,
  });
  log = [
    ...(log as unknown as StepLogEntry[]),
    { step: "decision", status: "done", attempt: version.attempt_number, at: nowIso(), detail: decision },
  ] as unknown as Json;

  if (decision === "APPROVED") {
    run = await updateRun(admin, run.id, {
      status: "approved",
      current_step: "final",
      final_lesson_version_id: version.id,
      completed_at: nowIso(),
      step_log: [...(log as unknown as StepLogEntry[]), { step: "final", status: "done", attempt: version.attempt_number, at: nowIso(), detail: "Lesson APPROVED and published" }] as unknown as Json,
    });
    return afterTerminal(admin, run);
  }

  await admin.from("rejection_logs").insert({
    run_id: run.id,
    user_id: run.user_id,
    lesson_version_id: version.id,
    evaluation_id: evaluation.id,
    attempt_number: version.attempt_number,
    failed_criteria: failed,
    evaluator_reasoning: validation.criteria.filter((c) => c.verdict === "FAIL") as unknown as Json,
    feedback_sent: decision === "NEEDS_IMPROVEMENT" ? buildFeedback(validation.criteria) : null,
    is_final_rejection: decision === "REJECTED",
  });

  if (decision === "NEEDS_IMPROVEMENT") {
    return updateRun(admin, run.id, {
      status: "needs_improvement",
      current_step: "regeneration",
      step_log: log,
    });
  }

  run = await updateRun(admin, run.id, { step_log: log });
  return finalizeRejected(admin, run, `After ${MAX_ATTEMPTS} generations the lesson still failed: ${failed.map((k) => CRITERION_NAME[k]).join(", ")}.`);
}

async function finalizeRejected(admin: Admin, run: RunRow, reason: string) {
  const crit = must(
    await admin.from("evaluation_criteria").select("criterion_key, verdict, reason").eq("run_id", run.id),
    "loading checkpoint history",
  );
  const stillFailing = crit.filter((c) => c.verdict === "FAIL");
  const explanation = `${reason} LessonIQ allows at most ${MAX_ATTEMPTS} generations (1 initial + ${MAX_ATTEMPTS - 1} retries) so the loop always terminates. Because at least one mandatory checkpoint never passed, the lesson was not published. ${
    stillFailing.length ? `Most recent evaluator reasons: ${stillFailing.slice(-3).map((c) => c.reason).join(" | ")}` : ""
  }`.trim();
  run = await updateRun(admin, run.id, {
    status: "rejected",
    current_step: "final",
    completed_at: nowIso(),
    rejection_explanation: explanation,
    step_log: appendLog(run, { step: "final", status: "done", attempt: run.attempts_used - 1, detail: "Lesson REJECTED - retry limit reached" }),
  });
  return afterTerminal(admin, run);
}

// ---------------------------------------------------------------- memory + self-evolution

async function afterTerminal(admin: Admin, run: RunRow): Promise<RunRow> {
  try {
    await updateMemoryAfterRun(admin, run);
    const analysis = await analyzeFailures(admin, run.user_id);
    return updateRun(admin, run.id, {
      current_step: "memory_update",
      step_log: appendLog(run, {
        step: "memory_update",
        status: "done",
        attempt: Math.max(0, run.attempts_used - 1),
        detail: `Memory updated · ${analysis.patterns} failure patterns · ${analysis.newRecommendations} new recommendations`,
      }),
    });
  } catch (e) {
    console.error("[lessoniq] memory update failed", e instanceof Error ? e.message : e);
    return updateRun(admin, run.id, {
      step_log: appendLog(run, { step: "memory_update", status: "failed", attempt: run.attempts_used - 1, detail: "Memory update failed; outcome is still saved." }),
    });
  }
}

async function updateMemoryAfterRun(admin: Admin, run: RunRow) {
  const crit = must(
    await admin
      .from("evaluation_criteria")
      .select("criterion_key, verdict, suggested_improvement, reason, evaluation_id, evaluations!inner(attempt_number)")
      .eq("run_id", run.id),
    "loading run checkpoints",
  );
  const versions = must(
    await admin.from("lesson_versions").select("attempt_number, revision_notes").eq("run_id", run.id),
    "loading versions",
  );
  type C = (typeof crit)[number];
  const byAttempt = new Map<number, C[]>();
  for (const c of crit) {
    const a = (c.evaluations as unknown as { attempt_number: number }).attempt_number;
    byAttempt.set(a, [...(byAttempt.get(a) ?? []), c]);
  }
  const firstFails = (byAttempt.get(0) ?? []).filter((c) => c.verdict === "FAIL").map((c) => CRITERION_NAME[c.criterion_key as CriterionKey]);
  const outcome =
    run.status === "approved"
      ? `"${run.topic}" was APPROVED after ${run.attempts_used} generation(s)${firstFails.length ? `; the first draft failed ${firstFails.join(", ")}` : " on the first try"}.`
      : `"${run.topic}" was REJECTED after ${run.attempts_used} generations; checkpoints that never passed are listed in its rejection log.`;

  const rows: Database["public"]["Tables"]["agent_memory"]["Insert"][] = [
    {
      user_id: run.user_id,
      memory_type: "topic_outcome",
      topic: run.topic,
      content: outcome + (run.demo_defect ? " (controlled test run)" : ""),
      run_id: run.id,
      metadata: { status: run.status, attempts: run.attempts_used, demo_defect: run.demo_defect } as unknown as Json,
    },
  ];

  const seenFeedback = new Set<string>();
  for (const c of crit) {
    if (c.verdict !== "FAIL" || seenFeedback.has(c.criterion_key)) continue;
    seenFeedback.add(c.criterion_key);
    rows.push({
      user_id: run.user_id,
      memory_type: "evaluator_feedback",
      topic: run.topic,
      criterion_key: c.criterion_key,
      content: `${CRITERION_NAME[c.criterion_key as CriterionKey]}: ${c.suggested_improvement}`,
      run_id: run.id,
    });
  }

  for (const [attempt, list] of byAttempt) {
    const next = byAttempt.get(attempt + 1);
    if (!next) continue;
    const fixed = list.filter((c) => c.verdict === "FAIL" && next.some((n) => n.criterion_key === c.criterion_key && n.verdict === "PASS"));
    if (!fixed.length) continue;
    const notes = versions.find((v) => v.attempt_number === attempt + 1)?.revision_notes ?? [];
    for (const f of fixed) {
      rows.push({
        user_id: run.user_id,
        memory_type: "successful_improvement",
        topic: run.topic,
        criterion_key: f.criterion_key,
        content: `${CRITERION_NAME[f.criterion_key as CriterionKey]} went FAIL→PASS after: ${notes.slice(0, 2).join(" ") || f.suggested_improvement}`,
        run_id: run.id,
      });
    }
  }
  must(await admin.from("agent_memory").insert(rows).select("id"), "saving memory");
}

/** Failure-pattern analysis over rejection logs → recommendations requiring human approval. */
export async function analyzeFailures(admin: Admin, userId: string) {
  const logs = must(
    await admin.from("rejection_logs").select("failed_criteria, evaluator_reasoning, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1000),
    "loading rejection logs",
  );
  const counts = new Map<CriterionKey, number>();
  const samples = new Map<CriterionKey, string[]>();
  for (const log of logs) {
    for (const k of log.failed_criteria as CriterionKey[]) {
      if (!CRITERION_KEYS.includes(k)) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
      const reasons = (Array.isArray(log.evaluator_reasoning) ? log.evaluator_reasoning : []) as { criterion_key?: string; reason?: string }[];
      const r = reasons.find((x) => x.criterion_key === k)?.reason;
      if (r && (samples.get(k)?.length ?? 0) < 3) samples.set(k, [...(samples.get(k) ?? []), r]);
    }
  }

  for (const [k, n] of counts) {
    const content = `${CRITERION_NAME[k]} failed ${n} time${n === 1 ? "" : "s"}. Typical reason: ${samples.get(k)?.[0] ?? "n/a"}`;
    const existing = await admin.from("agent_memory").select("id").eq("user_id", userId).eq("memory_type", "failure_pattern").eq("criterion_key", k).maybeSingle();
    if (existing.data) {
      await admin.from("agent_memory").update({ content, occurrences: n, metadata: { samples: samples.get(k) ?? [] } as unknown as Json }).eq("id", existing.data.id);
    } else {
      await admin.from("agent_memory").insert({ user_id: userId, memory_type: "failure_pattern", criterion_key: k, content, occurrences: n, metadata: { samples: samples.get(k) ?? [] } as unknown as Json });
    }
  }

  const recs = must(await admin.from("improvement_recommendations").select("*").eq("user_id", userId), "loading recommendations");
  let created = 0;
  for (const [k, n] of counts) {
    if (n < RECOMMENDATION_THRESHOLD) continue;
    for (const target of ["generator_prompt", "evaluator_rubric"] as const) {
      const open = recs.find((r) => r.criterion_key === k && r.target === target && (r.status === "pending" || r.status === "approved"));
      const evidence = (samples.get(k) ?? []) as unknown as Json;
      if (open?.status === "pending") {
        await admin.from("improvement_recommendations").update({ occurrences: n, evidence }).eq("id", open.id);
        continue;
      }
      if (open) continue; // already approved and active
      await admin.from("improvement_recommendations").insert({
        user_id: userId,
        criterion_key: k,
        target,
        proposed_change: target === "generator_prompt" ? GENERATOR_RULE_FOR[k] : RUBRIC_CLARIFICATION_FOR[k],
        rationale:
          target === "generator_prompt"
            ? `"${CRITERION_NAME[k]}" is a recurring failure (${n} rejected drafts). Adding this rule to the generator prompt should prevent it at the source.`
            : `"${CRITERION_NAME[k]}" failed ${n} times. This clarification makes the evaluator's evidence requirement explicit without lowering the pass bar.`,
        occurrences: n,
        evidence,
      });
      created++;
    }
  }

  // Effectiveness tracking for approved changes.
  for (const r of recs.filter((x) => x.status === "approved" && x.decided_at)) {
    const after = await admin.from("evaluations").select("id", { count: "exact", head: true }).eq("user_id", userId).gt("created_at", r.decided_at!);
    const failsAfter = await admin
      .from("evaluation_criteria")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("criterion_key", r.criterion_key)
      .eq("verdict", "FAIL")
      .gt("created_at", r.decided_at!);
    await admin.from("improvement_recommendations").update({ runs_after: after.count ?? 0, failures_after: failsAfter.count ?? 0 }).eq("id", r.id);
  }

  return { patterns: counts.size, newRecommendations: created };
}

export async function decideRecommendation(admin: Admin, userId: string, recId: string, approve: boolean) {
  const rec = must(await admin.from("improvement_recommendations").select("*").eq("id", recId).maybeSingle(), "loading recommendation");
  if (rec.user_id !== userId) throw new WorkflowError("not_found", "Recommendation not found.");
  if (rec.status !== "pending") throw new WorkflowError("invalid_state", "This recommendation was already decided.");
  if (!approve) {
    must(await admin.from("improvement_recommendations").update({ status: "dismissed", decided_at: nowIso() }).eq("id", recId).select("id").single(), "dismissing");
    return;
  }
  const setup = await ensureUserSetup(admin, userId);
  const evals = await admin.from("evaluations").select("id", { count: "exact", head: true }).eq("user_id", userId);
  const fails = await admin.from("evaluation_criteria").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("criterion_key", rec.criterion_key).eq("verdict", "FAIL");

  if (rec.target === "generator_prompt") {
    await createPromptVersion(admin, userId, [...setup.generatorPrompt.learned_rules, rec.proposed_change], `Approved recommendation: ${CRITERION_NAME[rec.criterion_key as CriterionKey]}`, rec.id);
  } else {
    const rubric = resolveRubric(setup.rubric.criteria);
    const next = rubric.map((c) => (c.key === rec.criterion_key ? { ...c, clarifications: [...c.clarifications, rec.proposed_change] } : c));
    await createRubricVersion(admin, userId, next, `Approved clarification for ${CRITERION_NAME[rec.criterion_key as CriterionKey]}`, rec.id);
  }
  must(
    await admin
      .from("improvement_recommendations")
      .update({ status: "approved", decided_at: nowIso(), runs_before: evals.count ?? 0, failures_before: fails.count ?? 0 })
      .eq("id", recId)
      .select("id")
      .single(),
    "approving recommendation",
  );
}

export async function createPromptVersion(admin: Admin, userId: string, rules: string[], reason: string, recId: string | null) {
  const latest = await admin.from("prompt_versions").select("version").eq("user_id", userId).eq("role", "generator").order("version", { ascending: false }).limit(1).maybeSingle();
  await admin.from("prompt_versions").update({ is_active: false }).eq("user_id", userId).eq("role", "generator");
  return must(
    await admin
      .from("prompt_versions")
      .insert({ user_id: userId, role: "generator", version: (latest.data?.version ?? 0) + 1, learned_rules: rules, change_reason: reason, source_recommendation_id: recId, is_active: true })
      .select("*")
      .single(),
    "creating prompt version",
  );
}

export async function createRubricVersion(admin: Admin, userId: string, criteria: CriterionDefinition[], reason: string, recId: string | null) {
  // Guard: all six mandatory checkpoints must remain, with unchanged pass bars.
  const safe = resolveRubric(criteria as unknown as Json);
  if (safe.length !== 6) throw new WorkflowError("invalid_rubric", "The rubric must keep all six mandatory checkpoints.");
  const latest = await admin.from("rubric_versions").select("version").eq("user_id", userId).order("version", { ascending: false }).limit(1).maybeSingle();
  await admin.from("rubric_versions").update({ is_active: false }).eq("user_id", userId);
  return must(
    await admin
      .from("rubric_versions")
      .insert({ user_id: userId, version: (latest.data?.version ?? 0) + 1, criteria: safe as unknown as Json, change_reason: reason, source_recommendation_id: recId, is_active: true })
      .select("*")
      .single(),
    "creating rubric version",
  );
}
