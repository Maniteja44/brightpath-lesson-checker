// Client-safe shared definitions for the LessonIQ agentic workflow.

export const MAX_ATTEMPTS = 3; // attempt 0 (initial) + 2 regenerations
export const RUNS_PER_HOUR_LIMIT = 12;
export const RECOMMENDATION_THRESHOLD = 2; // a failure category must repeat this often

export const DEFAULT_TOPIC = "Introduction to RAG (Retrieval-Augmented Generation)";
export const DEFAULT_LEVEL =
  "Indian student who has completed 12th grade, limited English vocabulary, no previous AI knowledge";

export const CRITERION_KEYS = [
  "accuracy",
  "beginner_language",
  "examples",
  "jargon_free",
  "key_points",
  "coherent_flow",
] as const;
export type CriterionKey = (typeof CRITERION_KEYS)[number];

export interface CriterionDefinition {
  key: CriterionKey;
  letter: string;
  name: string;
  checks: string[];
  passBar: string;
  clarifications: string[];
}

// Mandatory rubric. Self-evolution may only APPEND clarifications; it can never
// remove a criterion, rename it, or lower the pass bar.
export const BASE_RUBRIC: CriterionDefinition[] = [
  {
    key: "accuracy",
    letter: "A",
    name: "Accuracy and Grounding",
    checks: [
      "Are the explanations factually correct?",
      "Are important claims supported by the configured reference knowledge?",
      "Are unsupported claims or invented facts absent?",
    ],
    passBar:
      "PASS only if there is no factually wrong statement and no invented fact, statistic, name or date that contradicts or goes beyond the reference knowledge.",
    clarifications: [],
  },
  {
    key: "beginner_language",
    letter: "B",
    name: "Beginner-Friendly Language",
    checks: [
      "Can a learner with no technical background understand it?",
      "Are sentences simple and clear?",
    ],
    passBar:
      "PASS only if a 12th-grade learner with limited English could read every section without outside help: short sentences, common words, no dense paragraphs.",
    clarifications: [],
  },
  {
    key: "examples",
    letter: "C",
    name: "Teaching Through Examples",
    checks: [
      "Does the lesson include relevant everyday examples?",
      "Do examples actually explain the concept?",
    ],
    passBar:
      "PASS only if there are at least two concrete everyday examples that are familiar to the learner AND each example is explicitly connected back to how the concept works.",
    clarifications: [],
  },
  {
    key: "jargon_free",
    letter: "D",
    name: "Jargon-Free Explanation",
    checks: [
      "Are technical terms explained before being used?",
      "Are difficult terms clearly defined?",
    ],
    passBar:
      "PASS only if every technical term is explained in simple words at or before its first use. A single unexplained technical term is a FAIL.",
    clarifications: [],
  },
  {
    key: "key_points",
    letter: "E",
    name: "Key Point Coverage",
    checks: [
      "Does it explain what the topic is?",
      "Does it explain why the topic matters?",
      "Does it explain how it works?",
    ],
    passBar:
      "PASS only if WHAT it is, WHY it matters and HOW it works are each clearly and substantively explained. Missing or empty coverage of any one is a FAIL.",
    clarifications: [],
  },
  {
    key: "coherent_flow",
    letter: "F",
    name: "Coherent Teaching Flow",
    checks: [
      "Does the lesson follow a logical sequence?",
      "Does each section build on the previous section?",
    ],
    passBar:
      "PASS only if sections follow a logical order, ideas are introduced before they are used, and nothing contradicts an earlier section.",
    clarifications: [],
  },
];

export const CRITERION_NAME: Record<CriterionKey, string> = Object.fromEntries(
  BASE_RUBRIC.map((c) => [c.key, c.name]),
) as Record<CriterionKey, string>;

export const CRITERION_LETTER: Record<CriterionKey, string> = Object.fromEntries(
  BASE_RUBRIC.map((c) => [c.key, c.letter]),
) as Record<CriterionKey, string>;

// Rule suggested to the generator when a criterion fails repeatedly.
export const GENERATOR_RULE_FOR: Record<CriterionKey, string> = {
  accuracy:
    "Only state facts that are supported by well-established knowledge about the topic. Never invent statistics, names, dates or claims; if unsure, leave it out.",
  beginner_language:
    "Write every sentence in plain English a 12th-grade learner with limited vocabulary can read: keep most sentences under 20 words and avoid idioms.",
  examples:
    "Include at least two everyday Indian examples (for example a library, a kirana shop, exam preparation, railway enquiry) and explicitly say how each example maps to the concept.",
  jargon_free:
    "Define every technical term using simple language before using it in the lesson, and repeat the definition in Important Terms.",
  key_points:
    "Make sure separate, substantive paragraphs explain WHAT the topic is, WHY it matters and HOW it works step by step.",
  coherent_flow:
    "Follow the fixed section order and make each section refer back to ideas from the section before it; never use an idea before introducing it.",
};

// Clarification suggested for the evaluator rubric (never weakens the pass bar).
export const RUBRIC_CLARIFICATION_FOR: Record<CriterionKey, string> = {
  accuracy:
    "When a claim is not covered by the reference knowledge, quote it in the evidence and FAIL if it is specific (numbers, names, dates) or contradicts the reference.",
  beginner_language:
    "Quote the hardest sentence found in the lesson as evidence and explain why a 12th-grade learner would or would not understand it.",
  examples:
    "Count the everyday examples and state, for each, whether it is connected back to the concept; quote the connecting sentence.",
  jargon_free:
    "List every technical term found and the location of its first definition; FAIL and quote the term if any is used before it is defined.",
  key_points:
    "Quote the sentence(s) that explain WHAT, WHY and HOW separately; FAIL if any of the three cannot be quoted.",
  coherent_flow:
    "Name any concept that is used before it is introduced and quote where it first appears.",
};

export const DEMO_DEFECTS = {
  remove_examples: {
    label: "Remove everyday examples",
    description: "Deletes every everyday example and step analogy from the first draft.",
    expectedFailure: "examples" as CriterionKey,
  },
  unexplained_jargon: {
    label: "Introduce unexplained jargon",
    description:
      "Adds a paragraph of undefined technical terms and removes them from the glossary.",
    expectedFailure: "jargon_free" as CriterionKey,
  },
  inaccurate_statement: {
    label: "Add an inaccurate statement",
    description: "Inserts a false claim that RAG retrains the model on every question.",
    expectedFailure: "accuracy" as CriterionKey,
  },
  remove_why: {
    label: "Remove why RAG matters",
    description: "Empties the 'Why it matters' section and removes benefit-focused use cases.",
    expectedFailure: "key_points" as CriterionKey,
  },
} as const;
export type DemoDefect = keyof typeof DEMO_DEFECTS;
export const DEMO_DEFECT_KEYS = Object.keys(DEMO_DEFECTS) as DemoDefect[];

export const ALLOWED_MODELS = [
  { id: "openai/gpt-6-astra", label: "GPT-6 Astra", note: "Most capable · default" },
  { id: "openai/gpt-6.1-sol", label: "GPT-6.1 Sol", note: "Near-Astra quality" },
  { id: "openai/gpt-6-sol", label: "GPT-6 Sol", note: "Balanced" },
  { id: "openai/gpt-6-luna", label: "GPT-6 Luna", note: "Fast, low cost" },
  { id: "openai/gpt-5.6-terra", label: "GPT-5.6 Terra", note: "Balanced, lower cost" },
  { id: "openai/gpt-5.5", label: "GPT-5.5", note: "Previous flagship" },
] as const;
export const ALLOWED_MODEL_IDS: string[] = ALLOWED_MODELS.map((m) => m.id);
export const DEFAULT_MODEL = "openai/gpt-6-astra";

export const DIFFICULTIES = ["very simple", "simple", "moderate"] as const;

export type RunStatus =
  | "pending"
  | "generating"
  | "evaluating"
  | "needs_improvement"
  | "approved"
  | "rejected"
  | "failed";

export const TERMINAL_STATUSES: RunStatus[] = ["approved", "rejected", "failed"];

export const WORKFLOW_STEPS = [
  { key: "input_received", label: "User input" },
  { key: "memory_retrieval", label: "Memory retrieval" },
  { key: "generation", label: "Lesson Generator Agent" },
  { key: "lesson_output", label: "Lesson output" },
  { key: "evaluation", label: "Independent Evaluator Agent" },
  { key: "decision", label: "PASS / FAIL decision" },
  { key: "regeneration", label: "Regeneration engine" },
  { key: "final", label: "Approved lesson or rejection" },
  { key: "memory_update", label: "Memory update & failure analysis" },
] as const;
export type WorkflowStepKey = (typeof WORKFLOW_STEPS)[number]["key"];

export interface StepLogEntry {
  step: WorkflowStepKey;
  status: "running" | "done" | "failed" | "skipped";
  attempt: number;
  at: string;
  detail?: string;
}
