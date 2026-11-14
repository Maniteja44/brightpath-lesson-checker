# LessonIQ – Self-Evolving AI Lesson Generator

An agentic system that writes a beginner lesson, has an **independent evaluator agent** judge it on six strict PASS/FAIL checkpoints, regenerates it from the evaluator's feedback (max 2 retries), and publishes it only if every checkpoint passes. Rejections, evaluations and memory are kept in the database, and repeated failures turn into prompt/rubric recommendations that a person must approve.

Default topic: **Introduction to RAG**. Target learner: an Indian 12th-grade graduate with limited English and no AI background.

## Architecture
```
User input → Memory retrieval → Generator Agent → Lesson output → Independent Evaluator Agent
→ PASS/FAIL decision → (FAIL & attempts left) Regeneration engine → … → Approved lesson or Rejection
→ Memory update & failure analysis
```
- **Frontend:** TanStack Start (React 19, TypeScript), Tailwind v4, shadcn/ui, Lucide.
- **Backend:** Lovable Cloud (PostgreSQL, Auth, RLS). Server logic runs in TanStack `createServerFn` handlers (`src/lib/lessoniq/lessoniq.functions.ts`), which play the role of edge functions.
- **AI:** Lovable AI Gateway (OpenAI Responses API) through the Vercel AI SDK, streamed, with strict JSON schemas validated by zod. The model is configurable per agent in API Settings. The API key is a server secret only.

## Agents
| Agent | Prompt | Sees | Output |
|---|---|---|---|
| Generator | `GENERATOR_SYSTEM_PROMPT` + approved learned rules + memory guidance | topic, learner, feedback, previous draft | lesson JSON + revision notes |
| Evaluator | `EVALUATOR_SYSTEM_PROMPT` (separate) | rubric, reference knowledge, lesson markdown only | six verdicts with reason, evidence, fix |

The app code makes the final decision: **APPROVED only if all six checkpoints PASS** (`decide()` in `src/lib/lessoniq/lesson.ts`). Malformed evaluator output is rejected and re-evaluated up to 3 times. After that the run fails and is never approved.

## Rubric (binary, no partial credit)
A Accuracy & Grounding · B Beginner-Friendly Language · C Teaching Through Examples · D Jargon-Free Explanation · E Key Point Coverage · F Coherent Teaching Flow. Checkpoints and pass bars live in code (`constants.ts`). Rubric versions can only *add* clarifications.

## Retry mechanism
Attempt 0 is the first draft, attempts 1–2 are regenerations, so there are at most 3 generations. The attempt number comes from the number of saved lesson versions, enforced in `engine.server.ts`, with a database lock so each step runs only once. The browser can only call "advance". Workflow tables are read-only to browsers through RLS.

## Memory & self-evolution
`agent_memory` stores topic outcomes, failure patterns, evaluator feedback, successful fixes and user feedback. Before each run it is retrieved into the generator prompt. After each run, `analyzeFailures()` counts failure categories in `rejection_logs`. When a category reaches 2 failures, it proposes a generator rule and a rubric clarification. Nothing takes effect until a person approves it. Each approval creates a new `prompt_versions` or `rubric_versions` row (audit trail), and the app tracks failures before and after the change.

## Database
profiles, generation_runs, lesson_versions, evaluations, evaluation_criteria, rejection_logs, agent_memory, improvement_recommendations, prompt_versions, rubric_versions, reference_knowledge (seeded with RAG facts). All tables use RLS scoped to `auth.uid()`. A `dashboard_stats()` SQL function powers the dashboard.

## Environment
`LOVABLE_API_KEY` (server secret, managed by Lovable), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server), `VITE_SUPABASE_*` (browser). If the AI key is missing, the app shows a configuration warning and refuses to run.

## Run
```sh
bun install
bun run dev
bunx vitest run   # decision rule, retry limit, evaluator validation, defect injection
```

## Demo mode
On Generate Lesson, turn on **Demonstration mode** and pick a defect (remove examples, unexplained jargon, an inaccurate statement, or removing "why it matters"). The defect is injected into draft 0 only. The evaluator is not told about it. The run is clearly labelled as a controlled test.

## Limitations / future work
- Only OpenAI-family models through the gateway are offered.
- Reference matching uses keywords, not embeddings.
- A run advances while a browser tab drives it (it can be resumed at any time).
- Future: background workers, embedding-based memory retrieval, LLM-written recommendations.
