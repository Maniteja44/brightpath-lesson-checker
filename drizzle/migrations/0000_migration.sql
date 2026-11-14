
-- ============ profiles ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  generator_model text NOT NULL DEFAULT 'openai/gpt-6-astra',
  evaluator_model text NOT NULL DEFAULT 'openai/gpt-6-astra',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ prompt_versions ============
CREATE TABLE public.prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('generator','evaluator')),
  version integer NOT NULL,
  learned_rules text[] NOT NULL DEFAULT '{}',
  change_reason text NOT NULL,
  source_recommendation_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, version)
);
CREATE INDEX prompt_versions_user_idx ON public.prompt_versions (user_id, role, is_active);
GRANT SELECT ON public.prompt_versions TO authenticated;
GRANT ALL ON public.prompt_versions TO service_role;
ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own prompt versions" ON public.prompt_versions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============ rubric_versions ============
CREATE TABLE public.rubric_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  version integer NOT NULL,
  criteria jsonb NOT NULL,
  change_reason text NOT NULL,
  source_recommendation_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, version)
);
CREATE INDEX rubric_versions_user_idx ON public.rubric_versions (user_id, is_active);
GRANT SELECT ON public.rubric_versions TO authenticated;
GRANT ALL ON public.rubric_versions TO service_role;
ALTER TABLE public.rubric_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own rubric versions" ON public.rubric_versions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============ generation_runs ============
CREATE TABLE public.generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  topic text NOT NULL,
  education_level text NOT NULL,
  difficulty text NOT NULL,
  learning_objectives text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generating','evaluating','needs_improvement','approved','rejected','failed')),
  current_step text NOT NULL DEFAULT 'input_received',
  attempts_used integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  demo_defect text,
  memory_context text,
  memory_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  generator_model text NOT NULL,
  evaluator_model text NOT NULL,
  generator_prompt_version_id uuid REFERENCES public.prompt_versions(id),
  evaluator_prompt_version_id uuid REFERENCES public.prompt_versions(id),
  rubric_version_id uuid REFERENCES public.rubric_versions(id),
  final_lesson_version_id uuid,
  step_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  error_code text,
  rejection_explanation text,
  evaluator_malformed_count integer NOT NULL DEFAULT 0,
  lock_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX generation_runs_user_idx ON public.generation_runs (user_id, created_at DESC);
CREATE INDEX generation_runs_status_idx ON public.generation_runs (user_id, status);
GRANT SELECT ON public.generation_runs TO authenticated;
GRANT ALL ON public.generation_runs TO service_role;
ALTER TABLE public.generation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own runs" ON public.generation_runs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER runs_touch BEFORE UPDATE ON public.generation_runs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ lesson_versions ============
CREATE TABLE public.lesson_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.generation_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 0 AND 2),
  content jsonb NOT NULL,
  markdown text NOT NULL,
  revision_notes text[] NOT NULL DEFAULT '{}',
  injected_defect text,
  feedback_received text,
  model text NOT NULL,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, attempt_number)
);
CREATE INDEX lesson_versions_run_idx ON public.lesson_versions (run_id, attempt_number);
GRANT SELECT ON public.lesson_versions TO authenticated;
GRANT ALL ON public.lesson_versions TO service_role;
ALTER TABLE public.lesson_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own lesson versions" ON public.lesson_versions FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.generation_runs ADD CONSTRAINT generation_runs_final_lesson_fk FOREIGN KEY (final_lesson_version_id) REFERENCES public.lesson_versions(id) ON DELETE SET NULL;

-- ============ evaluations ============
CREATE TABLE public.evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.generation_runs(id) ON DELETE CASCADE,
  lesson_version_id uuid NOT NULL REFERENCES public.lesson_versions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  attempt_number integer NOT NULL,
  decision text NOT NULL CHECK (decision IN ('APPROVED','NEEDS_IMPROVEMENT','REJECTED')),
  pass_count integer NOT NULL,
  fail_count integer NOT NULL,
  overall_notes text,
  rubric_version_id uuid REFERENCES public.rubric_versions(id),
  model text NOT NULL,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_version_id)
);
CREATE INDEX evaluations_user_idx ON public.evaluations (user_id, created_at DESC);
CREATE INDEX evaluations_run_idx ON public.evaluations (run_id);
GRANT SELECT ON public.evaluations TO authenticated;
GRANT ALL ON public.evaluations TO service_role;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own evaluations" ON public.evaluations FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============ evaluation_criteria ============
CREATE TABLE public.evaluation_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.generation_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  criterion_key text NOT NULL CHECK (criterion_key IN ('accuracy','beginner_language','examples','jargon_free','key_points','coherent_flow')),
  criterion_name text NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('PASS','FAIL')),
  reason text NOT NULL,
  evidence text NOT NULL,
  suggested_improvement text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id, criterion_key)
);
CREATE INDEX evaluation_criteria_user_idx ON public.evaluation_criteria (user_id, criterion_key, verdict);
GRANT SELECT ON public.evaluation_criteria TO authenticated;
GRANT ALL ON public.evaluation_criteria TO service_role;
ALTER TABLE public.evaluation_criteria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own criteria" ON public.evaluation_criteria FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============ rejection_logs ============
CREATE TABLE public.rejection_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.generation_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  lesson_version_id uuid NOT NULL REFERENCES public.lesson_versions(id) ON DELETE CASCADE,
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  failed_criteria text[] NOT NULL,
  evaluator_reasoning jsonb NOT NULL,
  feedback_sent text,
  changes_made text[],
  regenerated_lesson_version_id uuid REFERENCES public.lesson_versions(id) ON DELETE SET NULL,
  result_after_regeneration text,
  is_final_rejection boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rejection_logs_user_idx ON public.rejection_logs (user_id, created_at DESC);
CREATE INDEX rejection_logs_run_idx ON public.rejection_logs (run_id, attempt_number);
GRANT SELECT ON public.rejection_logs TO authenticated;
GRANT ALL ON public.rejection_logs TO service_role;
ALTER TABLE public.rejection_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own rejection logs" ON public.rejection_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER rejection_logs_touch BEFORE UPDATE ON public.rejection_logs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ agent_memory ============
CREATE TABLE public.agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  memory_type text NOT NULL CHECK (memory_type IN ('topic_outcome','failure_pattern','evaluator_feedback','successful_improvement','user_feedback')),
  topic text,
  criterion_key text,
  content text NOT NULL,
  occurrences integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_id uuid REFERENCES public.generation_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_memory_user_idx ON public.agent_memory (user_id, memory_type, updated_at DESC);
CREATE UNIQUE INDEX agent_memory_failure_pattern_uniq ON public.agent_memory (user_id, criterion_key) WHERE memory_type = 'failure_pattern';
GRANT SELECT ON public.agent_memory TO authenticated;
GRANT ALL ON public.agent_memory TO service_role;
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own memory" ON public.agent_memory FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER agent_memory_touch BEFORE UPDATE ON public.agent_memory FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ improvement_recommendations ============
CREATE TABLE public.improvement_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  criterion_key text NOT NULL,
  target text NOT NULL CHECK (target IN ('generator_prompt','evaluator_rubric')),
  proposed_change text NOT NULL,
  rationale text NOT NULL,
  occurrences integer NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','dismissed')),
  decided_at timestamptz,
  failures_before integer,
  runs_before integer,
  failures_after integer NOT NULL DEFAULT 0,
  runs_after integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX improvement_recs_user_idx ON public.improvement_recommendations (user_id, status, created_at DESC);
GRANT SELECT ON public.improvement_recommendations TO authenticated;
GRANT ALL ON public.improvement_recommendations TO service_role;
ALTER TABLE public.improvement_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own recommendations" ON public.improvement_recommendations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER recs_touch BEFORE UPDATE ON public.improvement_recommendations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.prompt_versions ADD CONSTRAINT prompt_versions_rec_fk FOREIGN KEY (source_recommendation_id) REFERENCES public.improvement_recommendations(id) ON DELETE SET NULL;
ALTER TABLE public.rubric_versions ADD CONSTRAINT rubric_versions_rec_fk FOREIGN KEY (source_recommendation_id) REFERENCES public.improvement_recommendations(id) ON DELETE SET NULL;

-- ============ reference_knowledge ============
CREATE TABLE public.reference_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  topic_key text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  title text NOT NULL,
  content text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reference_knowledge_topic_idx ON public.reference_knowledge (topic_key);
GRANT SELECT, INSERT, DELETE ON public.reference_knowledge TO authenticated;
GRANT ALL ON public.reference_knowledge TO service_role;
ALTER TABLE public.reference_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read global or own references" ON public.reference_knowledge FOR SELECT TO authenticated USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "Insert own references" ON public.reference_knowledge FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Delete own references" ON public.reference_knowledge FOR DELETE TO authenticated USING (auth.uid() = user_id);

INSERT INTO public.reference_knowledge (user_id, topic_key, keywords, title, content, source) VALUES
(NULL, 'rag', ARRAY['rag','retrieval','retrieval-augmented','retrieval augmented'], 'Definition of RAG', 'Retrieval-Augmented Generation (RAG) is a technique where a large language model (LLM) first retrieves relevant information from an external knowledge source (such as a collection of documents) and then uses that retrieved information, added to its prompt, to generate an answer.', 'Lewis et al., 2020, "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks" (Facebook AI Research)'),
(NULL, 'rag', ARRAY['rag','retrieval','retrieval-augmented','retrieval augmented'], 'Why LLMs need RAG', 'An LLM only knows what was in its training data, which stops at a training cut-off date and usually does not include private or company-specific documents. Without access to sources, LLMs can produce confident but incorrect answers, often called hallucinations. RAG reduces (but does not fully eliminate) this problem by giving the model relevant source text at question time.', 'General LLM literature; OpenAI, Google and AWS RAG documentation'),
(NULL, 'rag', ARRAY['rag','retrieval','retrieval-augmented','retrieval augmented'], 'RAG does not retrain the model', 'RAG does not change or retrain the model''s internal weights. The model stays the same; only the information placed in its prompt (context) changes for each question. Updating knowledge in RAG means updating the documents in the knowledge source, which is much cheaper than retraining or fine-tuning.', 'AWS "What is RAG?"; Lewis et al., 2020'),
(NULL, 'rag', ARRAY['rag','retrieval','retrieval-augmented','retrieval augmented'], 'Typical RAG pipeline steps', 'A typical RAG pipeline: (1) Prepare documents by splitting them into smaller pieces called chunks. (2) Convert each chunk into an embedding, a list of numbers that represents its meaning, and store it in a vector database or search index. (3) When a user asks a question, convert the question into an embedding and search for the most similar chunks. (4) Add the retrieved chunks to the prompt together with the question (augmentation). (5) The LLM generates an answer using that context.', 'Common RAG architecture (LangChain, LlamaIndex, cloud vendor docs)'),
(NULL, 'rag', ARRAY['rag','retrieval','retrieval-augmented','retrieval augmented','embedding'], 'Embeddings and similarity search', 'An embedding is a numeric representation (vector) of text in which texts with similar meanings have vectors that are close together. Similarity is commonly measured with cosine similarity. Retrieval can also use keyword search (for example BM25) or a combination of keyword and vector search, called hybrid search.', 'Information retrieval literature'),
(NULL, 'rag', ARRAY['rag','retrieval','retrieval-augmented','retrieval augmented'], 'Benefits of RAG', 'Benefits: answers can use up-to-date or private information; answers can show the source documents they used (citations), which helps people check them; knowledge can be updated by changing documents instead of retraining the model; it is usually cheaper than fine-tuning for adding factual knowledge.', 'AWS, Google Cloud and Microsoft RAG documentation'),
(NULL, 'rag', ARRAY['rag','retrieval','retrieval-augmented','retrieval augmented'], 'Limitations of RAG', 'Limitations: if the retrieval step finds the wrong or incomplete documents, the answer can still be wrong; the model has a limited context window so only a limited amount of retrieved text fits; the quality of chunking and of the documents themselves matters; RAG reduces hallucinations but does not guarantee correct answers.', 'RAG evaluation literature'),
(NULL, 'rag', ARRAY['rag','retrieval','retrieval-augmented','retrieval augmented'], 'Common real-world uses of RAG', 'Common uses: customer-support chatbots that answer from a company''s help articles; internal assistants that search company policies; question answering over legal, medical or academic documents; search assistants that cite web pages; study helpers that answer questions from a textbook or notes.', 'Industry case studies');

-- ============ dashboard stats ============
CREATE OR REPLACE FUNCTION public.dashboard_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total_runs', (SELECT count(*) FROM generation_runs WHERE user_id = auth.uid()),
    'approved', (SELECT count(*) FROM generation_runs WHERE user_id = auth.uid() AND status = 'approved'),
    'rejected', (SELECT count(*) FROM generation_runs WHERE user_id = auth.uid() AND status = 'rejected'),
    'failed', (SELECT count(*) FROM generation_runs WHERE user_id = auth.uid() AND status = 'failed'),
    'in_progress', (SELECT count(*) FROM generation_runs WHERE user_id = auth.uid() AND status IN ('pending','generating','evaluating','needs_improvement')),
    'regeneration_attempts', (SELECT count(*) FROM lesson_versions WHERE user_id = auth.uid() AND attempt_number > 0),
    'total_evaluations', (SELECT count(*) FROM evaluations WHERE user_id = auth.uid()),
    'avg_pass_count', (SELECT round(avg(pass_count)::numeric, 2) FROM evaluations WHERE user_id = auth.uid()),
    'first_attempt_pass_rate', (SELECT round(100.0 * avg(CASE WHEN decision = 'APPROVED' THEN 1 ELSE 0 END)::numeric, 1) FROM evaluations WHERE user_id = auth.uid() AND attempt_number = 0),
    'criteria_pass_rates', (SELECT coalesce(jsonb_object_agg(criterion_key, rate), '{}'::jsonb) FROM (
        SELECT criterion_key, round(100.0 * avg(CASE WHEN verdict = 'PASS' THEN 1 ELSE 0 END)::numeric, 1) AS rate
        FROM evaluation_criteria WHERE user_id = auth.uid() GROUP BY criterion_key) s),
    'failure_counts', (SELECT coalesce(jsonb_object_agg(criterion_key, n), '{}'::jsonb) FROM (
        SELECT criterion_key, count(*) AS n FROM evaluation_criteria WHERE user_id = auth.uid() AND verdict = 'FAIL' GROUP BY criterion_key) f)
  );
$$;
GRANT EXECUTE ON FUNCTION public.dashboard_stats() TO authenticated;
