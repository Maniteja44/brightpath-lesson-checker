import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/lessoniq/pages";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard – LessonIQ" }, { name: "description", content: "Dashboard in LessonIQ." }, { property: "og:title", content: "Dashboard – LessonIQ" }, { property: "og:description", content: "Dashboard in LessonIQ." }] }),
  component: DashboardPage,
});
