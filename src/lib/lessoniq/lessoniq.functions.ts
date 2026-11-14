import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ALLOWED_MODEL_IDS, CRITERION_KEYS, DEMO_DEFECT_KEYS, DIFFICULTIES } from "./constants";

// All workflow writes happen here, on the server, with the caller's identity
// verified by requireSupabaseAuth. Workflow tables are read-only to browsers.

async function load() {
  const [{ supabaseAdmin }, engine] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("./engine.server"),
  ]);
  return { admin: supabaseAdmin, engine };
}

function toUserError(error: unknown): never {
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  throw new Error(message);
}

const startSchema = z.object({
  topic: z.string().trim().min(3, "Topic is too short").max(200, "Topic must be under 200 characters"),
  educationLevel: z.string().trim().min(2).max(300),
  difficulty: z.enum(DIFFICULTIES),
  objectives: z.string().trim().max(1500).nullable(),
  demoDefect: z.enum(DEMO_DEFECT_KEYS as [string, ...string[]]).nullable(),
});

export const startGenerationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => startSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { admin, engine } = await load();
    try {
      const run = await engine.startRun(admin, context.userId, {
        topic: data.topic,
        educationLevel: data.educationLevel,
        difficulty: data.difficulty,
        objectives: data.objectives || null,
        demoDefect: (data.demoDefect as never) ?? null,
      });
      return { runId: run.id };
    } catch (e) {
      toUserError(e);
    }
  });

export const advanceGenerationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ runId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { admin, engine } = await load();
    try {
      const { run, busy } = await engine.advanceRun(admin, context.userId, data.runId);
      return {
        busy,
        status: run.status,
        currentStep: run.current_step,
        attemptsUsed: run.attempts_used,
        errorMessage: run.error_message,
        errorCode: run.error_code,
      };
    } catch (e) {
      toUserError(e);
    }
  });

export const decideRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), approve: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { admin, engine } = await load();
    try {
      await engine.decideRecommendation(admin, context.userId, data.id, data.approve);
      return { ok: true };
    } catch (e) {
      toUserError(e);
    }
  });

export const runFailureAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin, engine } = await load();
    try {
      return await engine.analyzeFailures(admin, context.userId);
    } catch (e) {
      toUserError(e);
    }
  });

export const addRubricClarification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        criterionKey: z.enum(CRITERION_KEYS),
        text: z.string().trim().min(10, "Clarification is too short").max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { admin, engine } = await load();
    try {
      const setup = await engine.ensureUserSetup(admin, context.userId);
      const rubric = engine.resolveRubric(setup.rubric.criteria);
      const next = rubric.map((c) =>
        c.key === data.criterionKey ? { ...c, clarifications: [...c.clarifications, data.text] } : c,
      );
      const v = await engine.createRubricVersion(admin, context.userId, next, `Manual clarification added to ${data.criterionKey}`, null);
      return { version: v.version };
    } catch (e) {
      toUserError(e);
    }
  });

export const removeGeneratorRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ index: z.number().int().min(0).max(100) }).parse(input))
  .handler(async ({ data, context }) => {
    const { admin, engine } = await load();
    try {
      const setup = await engine.ensureUserSetup(admin, context.userId);
      const rules = [...setup.generatorPrompt.learned_rules];
      const [removed] = rules.splice(data.index, 1);
      if (!removed) throw new Error("Rule not found.");
      const v = await engine.createPromptVersion(admin, context.userId, rules, `Rule removed by user: "${removed.slice(0, 80)}"`, null);
      return { version: v.version };
    } catch (e) {
      toUserError(e);
    }
  });

export const updateModelSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        generatorModel: z.string().refine((m) => ALLOWED_MODEL_IDS.includes(m), "Unsupported model"),
        evaluatorModel: z.string().refine((m) => ALLOWED_MODEL_IDS.includes(m), "Unsupported model"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { admin, engine } = await load();
    try {
      await engine.ensureUserSetup(admin, context.userId);
      const res = await admin
        .from("profiles")
        .update({ generator_model: data.generatorModel, evaluator_model: data.evaluatorModel })
        .eq("id", context.userId);
      if (res.error) throw new Error("Could not save model settings.");
      return { ok: true };
    } catch (e) {
      toUserError(e);
    }
  });

export const submitLessonFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        runId: z.string().uuid(),
        helpful: z.boolean(),
        comment: z.string().trim().max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { admin, engine } = await load();
    try {
      const run = await engine.getOwnedRun(admin, context.userId, data.runId);
      const res = await admin.from("agent_memory").insert({
        user_id: context.userId,
        memory_type: "user_feedback",
        topic: run.topic,
        run_id: run.id,
        content: `${data.helpful ? "Helpful" : "Not helpful"} - "${run.topic}"${data.comment ? `: ${data.comment}` : ""}`,
        metadata: { helpful: data.helpful },
      });
      if (res.error) throw new Error("Could not save feedback.");
      return { ok: true };
    } catch (e) {
      toUserError(e);
    }
  });

export const ensureWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin, engine } = await load();
    try {
      const s = await engine.ensureUserSetup(admin, context.userId);
      return { generatorPromptVersion: s.generatorPrompt.version, rubricVersion: s.rubric.version };
    } catch (e) {
      toUserError(e);
    }
  });

export const getSystemStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ probeGateway }] = await Promise.all([import("./llm.server")]);
    const apiKeyConfigured = Boolean(process.env["LOVABLE_API_KEY"]);
    const started = Date.now();
    const db = await context.supabase.from("generation_runs").select("id", { count: "exact", head: true });
    const dbLatency = Date.now() - started;
    const gateway = await probeGateway();
    return {
      apiKeyConfigured,
      gatewayOk: gateway.ok,
      gatewayMessage: gateway.message,
      databaseOk: !db.error,
      databaseMessage: db.error ? "Database query failed" : `Connected (${dbLatency} ms)`,
      provider: "Lovable AI Gateway (OpenAI Responses API)",
      checkedAt: new Date().toISOString(),
    };
  });
