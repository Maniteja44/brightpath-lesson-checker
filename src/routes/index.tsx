import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BrainCircuit, CheckCircle2, GraduationCap, RefreshCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LessonIQ – Self-Evolving AI Lesson Generator" },
      { name: "description", content: "Generate beginner lessons, judge them with an independent AI evaluator on six strict checkpoints, and regenerate until they pass." },
      { property: "og:title", content: "LessonIQ – Self-Evolving AI Lesson Generator" },
      { property: "og:description", content: "Generate, evaluate and regenerate beginner lessons with an agentic AI loop." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const features = [
    { icon: GraduationCap, title: "Generator Agent", text: "Writes a complete beginner lesson for a 12th-grade learner." },
    { icon: ShieldCheck, title: "Independent Evaluator", text: "Six strict PASS/FAIL checkpoints. No partial credit." },
    { icon: RefreshCcw, title: "Bounded regeneration", text: "Feedback-driven retries, at most two, enforced on the server." },
    { icon: BrainCircuit, title: "Self-evolving memory", text: "Learns from repeated failures and proposes rule changes for approval." },
  ];
  return (
    <div className="min-h-screen bg-gradient-soft">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-display text-lg font-semibold"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground"><GraduationCap className="h-4 w-4" /></div>LessonIQ</div>
          <Button asChild variant="outline"><Link to="/auth" search={{ redirect: undefined }}>Sign in</Link></Button>
        </nav>
        <section className="py-20 text-center">
          <p className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-success" />Generate → Evaluate → Regenerate</p>
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">Lessons that only ship when an <span className="text-gradient-brand">independent AI evaluator</span> says they're ready.</h1>
          <p className="mx-auto mt-5 max-w-xl text-muted-foreground">LessonIQ writes beginner-friendly lessons, checks them against six mandatory checkpoints, and improves them using the evaluator's feedback.</p>
          <Button asChild size="lg" className="mt-8 bg-gradient-brand shadow-elevated"><Link to="/dashboard">Open dashboard <ArrowRight className="h-4 w-4" /></Link></Button>
        </section>
        <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-5 shadow-card">
              <f.icon className="mb-3 h-5 w-5 text-brand" />
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
