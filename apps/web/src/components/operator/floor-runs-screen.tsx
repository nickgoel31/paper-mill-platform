"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, CheckCircle2, Loader2, RefreshCw, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { offlineFloorStartRun, offlineFloorCompleteRun } from "@/lib/offline/wrapped-actions";

// jsPDF must stay out of the server bundle: client-only chunk.
const RunCardViewer = dynamic(() => import("./run-card-viewer"), {
  ssr: false,
  loading: () => (
    <div className="h-[60vh] flex items-center justify-center text-slate-400">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  ),
});

interface FloorRunsScreenProps {
  runs: any[];
}

/**
 * The whole floor-tablet experience: every run deployed to the floor, its run
 * card, and two buttons — Start Run, then Complete Run (which asks only for
 * feedback).
 */
export function FloorRunsScreen({ runs }: FloorRunsScreenProps) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [completing, setCompleting] = React.useState<any | null>(null);
  const [feedback, setFeedback] = React.useState("");

  // Pick up newly released runs without the operator touching anything.
  React.useEffect(() => {
    const t = setInterval(() => {
      if (!completing && !busyId && document.visibilityState === "visible") router.refresh();
    }, 20000);
    return () => clearInterval(t);
  }, [router, completing, busyId]);

  const handleStart = async (run: any) => {
    setBusyId(run.id);
    try {
      const res = await offlineFloorStartRun(run.id, `act_start_${run.id}_${Date.now()}`);
      if (res.queued) {
        toast.info("Offline — start saved on this tablet and will sync automatically.");
      } else if (res.data && !res.data.success) {
        toast.error(res.data.error);
      } else {
        toast.success(`Run #${run.runNumber} started.`);
        router.refresh();
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not start the run.");
    } finally {
      setBusyId(null);
    }
  };

  const handleComplete = async () => {
    if (!completing) return;
    const run = completing;
    setBusyId(run.id);
    try {
      const res = await offlineFloorCompleteRun({
        runId: run.id,
        feedback: feedback.trim() || undefined,
        actionId: `act_complete_${run.id}_${Date.now()}`,
      });
      if (res.queued) {
        toast.info("Offline — completion saved on this tablet and will sync automatically.");
        setCompleting(null);
        setFeedback("");
      } else if (res.data && !res.data.success) {
        toast.error(res.data.error);
      } else {
        toast.success(`Run #${run.runNumber} completed.`);
        setCompleting(null);
        setFeedback("");
        router.refresh();
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not complete the run.");
    } finally {
      setBusyId(null);
    }
  };

  if (runs.length === 0) {
    return (
      <div className="py-24 text-center space-y-6">
        <ClipboardList className="h-20 w-20 mx-auto text-slate-600" />
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-white">No runs on the floor</h1>
          <p className="text-slate-400 text-lg">
            Runs appear here as soon as the planner sends them to the floor.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => router.refresh()}
          className="h-16 px-8 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg gap-3"
        >
          <RefreshCw className="h-6 w-6" /> Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-16">
      {runs.map((run) => {
        const running = run.status === "RUNNING";
        const busy = busyId === run.id;
        return (
          <section
            key={run.id}
            className={`rounded-3xl border-4 p-4 sm:p-6 space-y-4 ${
              running ? "border-emerald-500 bg-slate-900" : "border-slate-700 bg-slate-900"
            }`}
          >
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-3xl sm:text-4xl font-black font-mono text-white">
                  RUN #{run.runNumber}
                </div>
                <div className="text-base font-mono text-slate-400">
                  {run.machine?.name} • {run.gsm} GSM
                </div>
              </div>
              <span
                className={`px-4 py-2 rounded-full text-sm font-black tracking-wider ${
                  running ? "bg-emerald-500 text-slate-950" : "bg-amber-400 text-slate-950"
                }`}
              >
                {running ? "RUNNING" : "READY TO START"}
              </span>
            </header>

            <RunCardViewer run={run} />

            {running ? (
              <Button
                type="button"
                disabled={busy}
                onClick={() => {
                  setFeedback("");
                  setCompleting(run);
                }}
                className="w-full h-20 rounded-3xl bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 font-black text-2xl sm:text-3xl gap-4 shadow-xl"
              >
                <CheckCircle2 className="h-9 w-9 stroke-[3]" /> COMPLETE RUN
              </Button>
            ) : (
              <Button
                type="button"
                disabled={busy}
                onClick={() => handleStart(run)}
                className="w-full h-20 rounded-3xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-2xl sm:text-3xl gap-4 shadow-xl"
              >
                {busy ? (
                  <Loader2 className="h-9 w-9 animate-spin" />
                ) : (
                  <Play className="h-9 w-9 fill-current" />
                )}
                START RUN
              </Button>
            )}
          </section>
        );
      })}

      {/* Complete Run: feedback only */}
      {completing && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-slate-900 border-4 border-amber-400 p-6 sm:p-8 space-y-5">
            <div>
              <div className="text-sm font-mono font-bold uppercase tracking-wider text-amber-400">
                Complete run
              </div>
              <div className="text-3xl font-black font-mono text-white">
                RUN #{completing.runNumber}
              </div>
            </div>

            <label className="block space-y-2">
              <span className="text-lg font-bold text-slate-200">Feedback</span>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={5}
                autoFocus
                placeholder="Anything to report about this run (optional)"
                className="w-full rounded-2xl bg-slate-950 border-2 border-slate-700 focus:border-amber-400 outline-none p-4 text-lg text-white placeholder:text-slate-500 select-text"
              />
            </label>

            <Button
              type="button"
              disabled={busyId === completing.id}
              onClick={handleComplete}
              className="w-full h-20 rounded-3xl bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 font-black text-2xl gap-4"
            >
              {busyId === completing.id ? (
                <Loader2 className="h-9 w-9 animate-spin" />
              ) : (
                <CheckCircle2 className="h-9 w-9 stroke-[3]" />
              )}
              COMPLETE RUN
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busyId === completing.id}
              onClick={() => setCompleting(null)}
              className="w-full h-14 rounded-2xl text-slate-400 hover:text-white font-bold text-lg"
            >
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
