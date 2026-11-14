import type { Json } from "@/integrations/supabase/types";
import { BASE_RUBRIC, type CriterionDefinition } from "./constants";

export function resolveRubricClient(stored: Json | null): CriterionDefinition[] {
  const list = Array.isArray(stored) ? (stored as unknown as Partial<CriterionDefinition>[]) : [];
  return BASE_RUBRIC.map((b) => ({ ...b, clarifications: (list.find((c) => c?.key === b.key)?.clarifications ?? []).filter((x) => typeof x === "string") }));
}
