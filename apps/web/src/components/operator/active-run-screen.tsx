"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updatePatternProgress } from "@/server/services/production-service";
import { formatWeightKg, formatTrimPercent, formatWidthInch } from "@/lib/utils";
import { PatternBar } from "@/components/deckle/pattern-bar";
import { TactileStepper } from "./tactile-stepper";
import { FullscreenNumpad } from "./fullscreen-numpad";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Scale,
  Play,
  Scissors,
  Layers,
  Sparkles,
  ArrowRight,
  Clock,
} from "lucide-react";

interface ActiveRunScreenProps {
  run: any;
}

export function ActiveRunScreen({ run }: ActiveRunScreenProps) {
  const router = useRouter();

  // Active pattern index (first pattern that is not done, or last pattern)
  const initialActiveIndex = run.patterns.findIndex(
    (p: any) => (p.completedRepetitions || 0) < p.repetitions
  );
  const [activePatternIndex, setActivePatternIndex] = React.useState<number>(
    initialActiveIndex >= 0 ? initialActiveIndex : 0
  );

  // Local state for patterns (optimistic UI)
  const [patterns, setPatterns] = React.useState(run.patterns);
  const [numpadOpen, setNumpadOpen] = React.useState(false);
  const [numpadTargetPatternId, setNumpadTargetPatternId] = React.useState<string | null>(null);

  // Elapsed run timer
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);

  React.useEffect(() => {
    const startedAt = run.startedAt ? new Date(run.startedAt).getTime() : Date.now();
    const updateTimer = () => {
      const now = Date.now();
      setElapsedSeconds(Math.max(0, Math.floor((now - startedAt) / 1000)));
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [run.startedAt]);

  const formatElapsed = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    if (hrs > 0) {
      return `${hrs}h ${mins.toString().padStart(2, "0")}m ${secs.toString().padStart(2, "0")}s`;
    }
    return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  };

  // Check how many patterns are done
  const completedCount = patterns.filter(
    (p: any) => (p.completedRepetitions || 0) >= p.repetitions
  ).length;
  const isAllPatternsDone = completedCount === patterns.length;

  const handleStepperChange = async (patternId: string, newReps: number) => {
    // Optimistic UI update
    setPatterns((prev: any[]) =>
      prev.map((p) => (p.id === patternId ? { ...p, completedRepetitions: newReps } : p))
    );

    try {
      const actionId = `act_reps_${patternId}_${newReps}_${Date.now()}`;
      await updatePatternProgress(run.id, patternId, newReps, undefined, actionId);
    } catch (err: any) {
      toast.error(err.message || "Failed to update repetitions. Rolling back.");
      // Rollback to server state
      router.refresh();
    }
  };

  const handleRecordWeightConfirm = async (weightKg: number) => {
    if (!numpadTargetPatternId) return;
    const targetId = numpadTargetPatternId;

    setPatterns((prev: any[]) =>
      prev.map((p) => (p.id === targetId ? { ...p, actualKg: weightKg } : p))
    );

    try {
      const targetPattern = patterns.find((p: any) => p.id === targetId);
      const reps = targetPattern?.completedRepetitions || targetPattern?.repetitions || 1;
      const actionId = `act_weight_${targetId}_${Date.now()}`;
      await updatePatternProgress(run.id, targetId, reps, weightKg, actionId);
      toast.success(`Recorded ${weightKg.toLocaleString("en-IN")} kg actual weight.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to record weight");
    } finally {
      setNumpadTargetPatternId(null);
    }
  };

  const handleMarkPatternDone = async (patIndex: number) => {
    const pat = patterns[patIndex];
    const targetReps = pat.repetitions;

    // Optimistically set to target reps
    setPatterns((prev: any[]) =>
      prev.map((p, idx) =>
        idx === patIndex ? { ...p, completedRepetitions: targetReps } : p
      )
    );

    try {
      await updatePatternProgress(run.id, pat.id, targetReps);
      toast.success(`Pattern #${pat.sequence} marked COMPLETED.`);

      // Move to next pattern if available
      if (patIndex + 1 < patterns.length) {
        setActivePatternIndex(patIndex + 1);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to mark pattern done");
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Sticky High-Contrast Header (32px+ Heading) */}
      <div className="sticky top-16 sm:top-20 z-20 bg-slate-900 border-2 border-slate-700 p-4 sm:p-5 rounded-3xl shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">
              RUNNING ON {run.machine.name}
            </span>
          </div>
          <div className="text-3xl sm:text-4xl font-black font-mono text-white tracking-tight mt-0.5">
            {run.runNumber}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="px-5 py-2.5 rounded-2xl bg-amber-400 text-slate-950 font-black text-3xl font-mono shadow-lg">
            {run.gsm} GSM
          </div>
          <div className="text-right">
            <div className="text-xs font-mono text-slate-400 font-bold uppercase tracking-wider">
              ELAPSED TIME
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-white flex items-center gap-1.5 justify-end">
              <Clock className="h-5 w-5 text-amber-400" />
              {formatElapsed(elapsedSeconds)}
            </div>
          </div>
        </div>
      </div>

      {/* Progress Strip */}
      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-800 text-white font-black font-mono flex items-center justify-center text-lg">
            {completedCount}/{patterns.length}
          </div>
          <div>
            <div className="text-sm font-bold text-white uppercase tracking-wide">
              Cutting Pattern Progress
            </div>
            <div className="text-xs font-mono text-slate-400">
              {isAllPatternsDone
                ? "All knife patterns completed! Ready to finalize run."
                : `Executing Pattern #${activePatternIndex + 1}`}
            </div>
          </div>
        </div>

        {isAllPatternsDone ? (
          <Button
            asChild
            className="h-12 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm gap-2 shadow-lg"
          >
            <Link href={`/operator/run/${run.id}/complete`}>
              FINALIZE RUN <ArrowRight className="h-4 w-4 stroke-[3]" />
            </Link>
          </Button>
        ) : (
          <Badge className="bg-slate-800 text-amber-300 font-mono text-xs px-3 py-1">
            IN PROGRESS
          </Badge>
        )}
      </div>

      {/* Pattern Cards Sequence */}
      <div className="space-y-4">
        {patterns.map((pat: any, idx: number) => {
          const isCompleted = (pat.completedRepetitions || 0) >= pat.repetitions;
          const isExpanded = idx === activePatternIndex;

          const cutsDisplay = pat.cuts.map((c: any) => {
            const item = run.orderItems?.find((it: any) => it.id === c.orderItemId);
            return {
              orderItemId: c.orderItemId,
              orderNumber: item?.order?.orderNumber,
              clientName: item?.order?.client?.name,
              widthInch: Number(c.widthInch),
              count: c.count,
            };
          });

          // Large Cut Formula Text: "196" = 130" + 32" + 32""
          const cutsFormula = pat.cuts
            .flatMap((c: any) => Array(c.count).fill(`${formatWidthInch(c.widthInch)}`))
            .join(" + ");

          // Completed Collapsed Summary Row
          if (isCompleted && !isExpanded) {
            return (
              <div
                key={pat.id}
                onClick={() => setActivePatternIndex(idx)}
                className="p-4 rounded-2xl bg-emerald-950/40 border-2 border-emerald-800 hover:border-emerald-600 cursor-pointer flex items-center justify-between transition-all select-none shadow"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-7 w-7 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-base font-bold text-white flex items-center gap-2">
                      Pattern #{pat.sequence}: {cutsFormula}
                    </div>
                    <div className="text-xs font-mono text-emerald-300">
                      Completed {pat.completedRepetitions || pat.repetitions}/{pat.repetitions} reps •{" "}
                      {formatWeightKg(pat.actualKg || pat.estimatedKg)}
                    </div>
                  </div>
                </div>

                <Button variant="ghost" size="sm" className="text-emerald-400 hover:text-white">
                  <ChevronDown className="h-5 w-5" />
                </Button>
              </div>
            );
          }

          // Active Expanded Pattern Card
          return (
            <div
              key={pat.id}
              className={`p-6 rounded-3xl border-2 transition-all shadow-2xl space-y-6 ${
                isExpanded
                  ? "bg-slate-950 border-amber-400 ring-4 ring-amber-400/10"
                  : "bg-slate-950 border-slate-800"
              }`}
            >
              {/* Pattern Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="h-10 w-10 rounded-xl bg-amber-400 text-slate-950 font-black font-mono text-xl flex items-center justify-center shadow">
                    #{pat.sequence}
                  </span>
                  <div>
                    <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
                      SLITTER KNIFE SETUP
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-white">
                      Target: {pat.repetitions} repetitions
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <span className="text-xs text-slate-400 block font-sans">TRIM LOSS</span>
                  <span className="text-lg font-bold text-amber-400">
                    {Number(pat.trimPercent).toFixed(2)}% ({formatWidthInch(pat.trimWidthInch)})
                  </span>
                </div>
              </div>

              {/* Proportional Scale PatternBar */}
              <div className="bg-white p-3 rounded-2xl">
                <PatternBar
                  deckleInch={Number(run.machine.maxDeckleInch)}
                  usedWidthInch={Number(pat.usedWidthInch)}
                  trimWidthInch={Number(pat.trimWidthInch)}
                  trimPercent={Number(pat.trimPercent)}
                  repetitions={pat.repetitions}
                  estimatedKg={Number(pat.estimatedKg)}
                  sequence={pat.sequence}
                  cuts={cutsDisplay}
                  isManuallyEdited={pat.isManuallyEdited}
                />
              </div>

              {/* Big Cut Widths Banner (Headings 28px+) */}
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-1">
                <span className="text-xs font-mono font-bold uppercase text-slate-400 tracking-wider">
                  KNIFE CUTS EQUATION
                </span>
                <div className="text-2xl sm:text-3xl font-black font-mono text-white tracking-wide">
                  <span className="text-amber-400">{formatWidthInch(run.machine.maxDeckleInch)}</span> = {cutsFormula}
                </div>
              </div>

              {/* Repetition Stepper & Actual Kg Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* 56px+ Tactile Stepper */}
                <div className="flex flex-col items-center justify-center p-4 bg-slate-900 rounded-2xl border border-slate-800">
                  <TactileStepper
                    value={pat.completedRepetitions || 0}
                    min={0}
                    max={pat.repetitions * 2}
                    onChange={(val) => handleStepperChange(pat.id, val)}
                    label="COMPLETED REPETITIONS"
                    unit="knife sets"
                  />
                </div>

                {/* Weight Record Box */}
                <div className="flex flex-col items-center justify-center p-4 bg-slate-900 rounded-2xl border border-slate-800 space-y-3">
                  <span className="text-sm font-bold uppercase tracking-wider text-slate-300">
                    RECORD ACTUAL REEL WEIGHT
                  </span>
                  <div className="text-3xl font-mono font-black text-emerald-400">
                    {pat.actualKg ? formatWeightKg(pat.actualKg) : formatWeightKg(pat.estimatedKg)}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setNumpadTargetPatternId(pat.id);
                      setNumpadOpen(true);
                    }}
                    className="h-14 w-full rounded-xl bg-slate-800 hover:bg-slate-700 text-white border-slate-700 text-base font-bold gap-2"
                  >
                    <Scale className="h-5 w-5 text-emerald-400" /> Enter Measured Kg (Numpad)
                  </Button>
                </div>
              </div>

              {/* Full Width "Mark Pattern Done" Button (Minimum 64px tap target) */}
              <div className="pt-2">
                <Button
                  type="button"
                  onClick={() => handleMarkPatternDone(idx)}
                  className="w-full h-16 sm:h-20 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-xl sm:text-2xl gap-3 shadow-xl transition-transform active:scale-[0.98]"
                >
                  <CheckCircle2 className="h-7 w-7 stroke-[3]" /> MARK PATTERN #{pat.sequence} COMPLETED
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Touch Numpad Modal */}
      <FullscreenNumpad
        open={numpadOpen}
        onOpenChange={setNumpadOpen}
        title="Enter Measured Pattern Weight"
        initialValue={
          numpadTargetPatternId
            ? patterns.find((p: any) => p.id === numpadTargetPatternId)?.actualKg || 0
            : 0
        }
        unit="kg"
        onConfirm={handleRecordWeightConfirm}
      />
    </div>
  );
}
