import { describe, expect, it } from "vitest";
import { decide, nextAttemptNumber, validateEvaluation, injectDefect, type Lesson } from "@/lib/lessoniq/lesson";
import { CRITERION_KEYS } from "@/lib/lessoniq/constants";

const all = (v: "PASS" | "FAIL") => CRITERION_KEYS.map((k) => ({ criterion_key: k, verdict: v }));

describe("LessonIQ rules", () => {
  it("approves only when all six checkpoints pass", () => {
    expect(decide(all("PASS"), 0)).toBe("APPROVED");
    const oneFail = all("PASS").map((c, i) => (i === 3 ? { ...c, verdict: "FAIL" as const } : c));
    expect(decide(oneFail, 0)).toBe("NEEDS_IMPROVEMENT");
  });
  it("rejects a failing lesson on attempt 2 (after two retries)", () => {
    expect(decide(all("FAIL"), 1)).toBe("NEEDS_IMPROVEMENT");
    expect(decide(all("FAIL"), 2)).toBe("REJECTED");
  });
  it("allows at most three generations", () => {
    expect(nextAttemptNumber(2)).toBe(2);
    expect(nextAttemptNumber(3)).toBeNull();
  });
  it("rejects malformed evaluator output (missing checkpoint)", () => {
    const res = validateEvaluation({ criteria: CRITERION_KEYS.slice(0, 5).map((k) => ({ criterion_key: k, verdict: "PASS", reason: "r", evidence: "e", suggested_improvement: "s" })), overall_notes: "" });
    expect(res.ok).toBe(false);
  });
  it("demo defect removes everyday examples", () => {
    const lesson = { everyday_examples: [{ title: "a", scenario: "b", connection_to_concept: "c" }], how_it_works: [{ step_number: 1, title: "t", explanation: "x", everyday_analogy: "y" }] } as unknown as Lesson;
    expect(injectDefect(lesson, "remove_examples").everyday_examples).toHaveLength(0);
  });
});
