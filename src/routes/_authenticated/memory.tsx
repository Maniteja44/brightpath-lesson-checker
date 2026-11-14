import { createFileRoute } from "@tanstack/react-router";
import { MemoryPage } from "@/components/lessoniq/pages";

export const Route = createFileRoute("/_authenticated/memory")({
  head: () => ({ meta: [{ title: "Memory & Learning – LessonIQ" }, { name: "description", content: "Memory & Learning in LessonIQ." }, { property: "og:title", content: "Memory & Learning – LessonIQ" }, { property: "og:description", content: "Memory & Learning in LessonIQ." }] }),
  component: MemoryPage,
});
