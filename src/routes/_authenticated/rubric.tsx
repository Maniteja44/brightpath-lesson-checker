import { createFileRoute } from "@tanstack/react-router";
import { RubricPage } from "@/components/lessoniq/pages";

export const Route = createFileRoute("/_authenticated/rubric")({
  head: () => ({ meta: [{ title: "Rubric Settings – LessonIQ" }, { name: "description", content: "Rubric Settings in LessonIQ." }, { property: "og:title", content: "Rubric Settings – LessonIQ" }, { property: "og:description", content: "Rubric Settings in LessonIQ." }] }),
  component: RubricPage,
});
