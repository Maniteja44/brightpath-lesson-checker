import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { advanceGenerationRun } from "@/lib/lessoniq/lessoniq.functions";
import { TERMINAL_STATUSES, type RunStatus } from "@/lib/lessoniq/constants";

// Drives a run forward one server-side step at a time. The server decides what
// each step does and enforces the retry budget; this loop only keeps asking.
interface RunEngine {
  drive: (runId: string) => void;
  isDriving: (runId: string) => boolean;
  lastError: (runId: string) => string | null;
}

const Ctx = createContext<RunEngine | null>(null);
const MAX_CALLS_PER_DRIVE = 20; // safety net: 3 generations + 3 evaluations + malformed retries + busy waits

export function RunEngineProvider({ children }: { children: ReactNode }) {
  const advance = useServerFn(advanceGenerationRun);
  const queryClient = useQueryClient();
  const driving = useRef(new Set<string>());
  const [, force] = useState(0);
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const refresh = useCallback(
    (runId: string) => {
      queryClient.invalidateQueries({ queryKey: ["run", runId] });
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      queryClient.invalidateQueries({ queryKey: ["latest-run"] });
    },
    [queryClient],
  );

  const drive = useCallback(
    (runId: string) => {
      if (driving.current.has(runId)) return;
      driving.current.add(runId);
      setErrors((e) => ({ ...e, [runId]: null }));
      force((n) => n + 1);
      (async () => {
        try {
          for (let i = 0; i < MAX_CALLS_PER_DRIVE; i++) {
            const res = await advance({ data: { runId } });
            refresh(runId);
            if (TERMINAL_STATUSES.includes(res.status as RunStatus)) {
              if (res.status === "approved") toast.success("Lesson approved: all six checkpoints passed.");
              else if (res.status === "rejected") toast.error("Lesson rejected after the maximum number of retries.");
              else toast.error(res.errorMessage ?? "The run failed.");
              break;
            }
            if (res.errorCode) {
              setErrors((e) => ({ ...e, [runId]: res.errorMessage }));
              toast.error(res.errorMessage ?? "A step failed.");
              break;
            }
            if (res.busy) await new Promise((r) => setTimeout(r, 4000));
          }
        } catch (err) {
          const msg =
            err instanceof Error
              ? /fetch|network|Failed to fetch/i.test(err.message)
                ? "Network error: the connection to the server was lost. Your progress is saved - press Resume."
                : err.message
              : "Unexpected error.";
          setErrors((e) => ({ ...e, [runId]: msg }));
          toast.error(msg);
        } finally {
          driving.current.delete(runId);
          force((n) => n + 1);
          refresh(runId);
          queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
          queryClient.invalidateQueries({ queryKey: ["memory"] });
          queryClient.invalidateQueries({ queryKey: ["rejection-logs"] });
          queryClient.invalidateQueries({ queryKey: ["evaluation-history"] });
        }
      })();
    },
    [advance, refresh, queryClient],
  );

  const value: RunEngine = {
    drive,
    isDriving: (id) => driving.current.has(id),
    lastError: (id) => errors[id] ?? null,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRunEngine() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRunEngine must be used inside RunEngineProvider");
  return v;
}
