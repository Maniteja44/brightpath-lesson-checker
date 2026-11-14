import { createFileRoute } from "@tanstack/react-router";
import { RejectionsPage } from "@/components/lessoniq/pages";

export const Route = createFileRoute("/_authenticated/rejections")({
  head: () => ({ meta: [{ title: "Rejection Logs – LessonIQ" }, { name: "description", content: "Rejection Logs in LessonIQ." }, { property: "og:title", content: "Rejection Logs – LessonIQ" }, { property: "og:description", content: "Rejection Logs in LessonIQ." }] }),
  component: RejectionsPage,
});
