import { createFileRoute } from "@tanstack/react-router";
import { HistoryPage } from "@/components/lessoniq/pages";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Evaluation History – LessonIQ" }, { name: "description", content: "Evaluation History in LessonIQ." }, { property: "og:title", content: "Evaluation History – LessonIQ" }, { property: "og:description", content: "Evaluation History in LessonIQ." }] }),
  component: HistoryPage,
});
