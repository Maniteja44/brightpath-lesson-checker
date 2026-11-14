import { createFileRoute } from "@tanstack/react-router";
import { WorkflowPage } from "@/components/lessoniq/pages";

export const Route = createFileRoute("/_authenticated/workflow")({
  head: () => ({ meta: [{ title: "Workflow Architecture – LessonIQ" }, { name: "description", content: "Workflow Architecture in LessonIQ." }, { property: "og:title", content: "Workflow Architecture – LessonIQ" }, { property: "og:description", content: "Workflow Architecture in LessonIQ." }] }),
  component: WorkflowPage,
});
