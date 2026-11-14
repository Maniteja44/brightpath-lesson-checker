import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/lessoniq/pages";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "API Settings – LessonIQ" }, { name: "description", content: "API Settings in LessonIQ." }, { property: "og:title", content: "API Settings – LessonIQ" }, { property: "og:description", content: "API Settings in LessonIQ." }] }),
  component: SettingsPage,
});
