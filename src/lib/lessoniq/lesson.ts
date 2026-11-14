import { z } from "zod";
import {
  CRITERION_KEYS,
  CRITERION_NAME,
  MAX_ATTEMPTS,
  type CriterionKey,
  type DemoDefect,
} from "./constants";

// ---------- Lesson (generator output) ----------
// Strict-schema friendly: every field required, objects closed.
export const lessonSchema = z
  .object({
    title: z.string(),
    introduction: z.string(),
    what_it_is: z.string(),
    why_it_matters: z.string(),
    how_it_works: z.array(
      z
        .object({
          step_number: z.number(),
          title: z.string(),
          explanation: z.string(),
          everyday_analogy: z.string(),
        })
        .strict(),
    ),
    everyday_examples: z.array(
      z
        .object({
          title: z.string(),
          scenario: z.string(),
          connection_to_concept: z.string(),
        })
        .strict(),
    ),
    technical_explanation: z.string(),
    key_terms: z.array(z.object({ term: z.string(), definition: z.string() }).strict()),
    use_cases: z.array(z.object({ title: z.string(), description: z.string() }).strict()),
    summary: z.string(),
    questions: z.array(z.object({ question: z.string(), answer: z.string() }).strict()),
    revision_notes: z.array(z.string()),
  })
  .strict();
export type Lesson = z.infer<typeof lessonSchema>;

/** Light structural checks the schema cannot express (counts, emptiness). */
export function lessonStructureProblems(lesson: Lesson): string[] {
  const problems: string[] = [];
  if (!lesson.title.trim()) problems.push("Lesson title is empty.");
  if (lesson.how_it_works.length < 3) problems.push("Fewer than 3 'how it works' steps.");
  if (lesson.questions.length !== 5) problems.push(`Expected 5 questions, got ${lesson.questions.length}.`);
  if (lesson.key_terms.length < 3) problems.push("Fewer than 3 key terms.");
  return problems;
}

export const LESSON_SECTIONS = [
  { id: "introduction", label: "Introduction" },
  { id: "what_it_is", label: "What it means" },
  { id: "why_it_matters", label: "Why it matters" },
  { id: "how_it_works", label: "How it works" },
  { id: "everyday_examples", label: "Everyday examples" },
  { id: "technical_explanation", label: "Technical explanation" },
  { id: "key_terms", label: "Important terms" },
  { id: "use_cases", label: "Real-world use cases" },
  { id: "summary", label: "Summary" },
  { id: "questions", label: "Check your understanding" },
] as const;

/** Lesson as Markdown. revision_notes are deliberately excluded (the evaluator must not see them). */
export function lessonToMarkdown(lesson: Lesson): string {
  const out: string[] = [];
  out.push(`# ${lesson.title}`, "");
  out.push("## Introduction", "", lesson.introduction, "");
  out.push("## What it means", "", lesson.what_it_is, "");
  out.push("## Why it matters", "", lesson.why_it_matters || "", "");
  out.push("## How it works, step by step", "");
  for (const s of lesson.how_it_works) {
    out.push(`### Step ${s.step_number}: ${s.title}`, "", s.explanation, "");
    if (s.everyday_analogy.trim()) out.push(`> **Everyday analogy:** ${s.everyday_analogy}`, "");
  }
  out.push("## Everyday examples", "");
  if (lesson.everyday_examples.length === 0) out.push("_(none)_", "");
  for (const e of lesson.everyday_examples) {
    out.push(`### ${e.title}`, "", e.scenario, "", `**How this connects:** ${e.connection_to_concept}`, "");
  }
  out.push("## Technical explanation in simple words", "", lesson.technical_explanation, "");
  out.push("## Important terms", "");
  for (const t of lesson.key_terms) out.push(`- **${t.term}:** ${t.definition}`);
  out.push("", "## Real-world use cases", "");
  for (const u of lesson.use_cases) out.push(`- **${u.title}:** ${u.description}`);
  out.push("", "## Summary", "", lesson.summary, "");
  out.push("## Check your understanding", "");
  lesson.questions.forEach((q, i) => {
    out.push(`**${i + 1}. ${q.question}**`, "", `Answer: ${q.answer}`, "");
  });
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// ---------- Controlled defect injection (demo mode, attempt 0 only) ----------
export const JARGON_PARAGRAPH =
  "Under the hood, the pipeline performs dense vector retrieval with an HNSW index, applies cosine-similarity re-ranking with a cross-encoder, and stuffs the top-k chunks into the context window before autoregressive decoding.";
export const JARGON_TERMS = ["vector", "hnsw", "cosine", "cross-encoder", "top-k", "context window", "autoregressive", "re-rank"];
export const FALSE_STATEMENT =
  "Important fact: RAG works by permanently retraining the AI model's brain every time you ask a question, so the model memorises the whole internet in real time.";

export function injectDefect(lesson: Lesson, defect: DemoDefect): Lesson {
  const copy: Lesson = JSON.parse(JSON.stringify(lesson));
  switch (defect) {
    case "remove_examples":
      copy.everyday_examples = [];
      copy.how_it_works = copy.how_it_works.map((s) => ({ ...s, everyday_analogy: "" }));
      return copy;
    case "unexplained_jargon":
      copy.technical_explanation = `${JARGON_PARAGRAPH} ${copy.technical_explanation}`;
      copy.key_terms = copy.key_terms.filter(
        (t) => !JARGON_TERMS.some((j) => t.term.toLowerCase().includes(j)),
      );
      return copy;
    case "inaccurate_statement":
      copy.what_it_is = `${copy.what_it_is}\n\n${FALSE_STATEMENT}`;
      return copy;
    case "remove_why":
      copy.why_it_matters = "";
      copy.use_cases = [];
      return copy;
  }
}

// ---------- Evaluation (evaluator output) ----------
export const evaluatorOutputSchema = z
  .object({
    criteria: z.array(
      z
        .object({
          criterion_key: z.enum(CRITERION_KEYS),
          verdict: z.enum(["PASS", "FAIL"]),
          reason: z.string(),
          evidence: z.string(),
          suggested_improvement: z.string(),
        })
        .strict(),
    ),
    overall_notes: z.string(),
  })
  .strict();
export type EvaluatorOutput = z.infer<typeof evaluatorOutputSchema>;

export interface ValidatedCriterion {
  criterion_key: CriterionKey;
  criterion_name: string;
  verdict: "PASS" | "FAIL";
  reason: string;
  evidence: string;
  suggested_improvement: string;
}

export type EvaluationValidation =
  | { ok: true; criteria: ValidatedCriterion[]; overall_notes: string }
  | { ok: false; errors: string[] };

/** Backend validation: exactly one verdict per mandatory checkpoint, binary verdicts, non-empty reasons. */
export function validateEvaluation(raw: unknown): EvaluationValidation {
  const parsed = evaluatorOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  const errors: string[] = [];
  const seen = new Map<CriterionKey, ValidatedCriterion>();
  for (const c of parsed.data.criteria) {
    if (seen.has(c.criterion_key)) errors.push(`Duplicate verdict for ${c.criterion_key}.`);
    if (!c.reason.trim()) errors.push(`Empty reason for ${c.criterion_key}.`);
    if (!c.evidence.trim()) errors.push(`Empty evidence for ${c.criterion_key}.`);
    if (c.verdict === "FAIL" && !c.suggested_improvement.trim())
      errors.push(`FAIL on ${c.criterion_key} has no suggested improvement.`);
    seen.set(c.criterion_key, {
      ...c,
      criterion_name: CRITERION_NAME[c.criterion_key],
    });
  }
  for (const key of CRITERION_KEYS) if (!seen.has(key)) errors.push(`Missing verdict for ${key}.`);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    criteria: CRITERION_KEYS.map((k) => seen.get(k)!),
    overall_notes: parsed.data.overall_notes,
  };
}

// ---------- Decision rule ----------
export type Decision = "APPROVED" | "NEEDS_IMPROVEMENT" | "REJECTED";

/**
 * APPROVED only when all six mandatory checkpoints PASS.
 * Any FAIL → NEEDS_IMPROVEMENT while attempts remain, REJECTED on the last allowed attempt.
 */
export function decide(criteria: Pick<ValidatedCriterion, "criterion_key" | "verdict">[], attemptNumber: number): Decision {
  const keys = new Set(criteria.map((c) => c.criterion_key));
  const allPresent = CRITERION_KEYS.every((k) => keys.has(k));
  const allPass = allPresent && criteria.every((c) => c.verdict === "PASS");
  if (allPass) return "APPROVED";
  return attemptNumber >= MAX_ATTEMPTS - 1 ? "REJECTED" : "NEEDS_IMPROVEMENT";
}

/** Next attempt number, or null when the retry budget is spent. */
export function nextAttemptNumber(versionsSoFar: number): number | null {
  return versionsSoFar < MAX_ATTEMPTS ? versionsSoFar : null;
}

/** Feedback text that is sent back to the generator. */
export function buildFeedback(criteria: ValidatedCriterion[]): string {
  const failed = criteria.filter((c) => c.verdict === "FAIL");
  return failed
    .map(
      (c, i) =>
        `${i + 1}. [FAIL] ${c.criterion_name}\n   Why it failed: ${c.reason}\n   Evidence: ${c.evidence}\n   Required fix: ${c.suggested_improvement}`,
    )
    .join("\n\n");
}
