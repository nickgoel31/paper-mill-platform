"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { startProductionRun } from "@/server/services/production-service";
import { formatWeightKg, formatTrimPercent } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Factory,
  Play,
  RotateCw,
  Layers,
  Scissors,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
} from "lucide-react";

interface MachineInfo {
  id: string;
  name: string;
  code: string;
  maxDeckleInch: number;
}

interface RunCardData {
  id: string;
  runNumber: string;
  gsm: number;
  totalPlannedKg: any;
  totalTrimPercent: any;
  status: string;
  createdAt: Date | string;
  patterns: { id: string; sequence: number }[];
}

interface MachineQueueScreenProps {
  machines: MachineInfo[];
  initialMachineId: string;
  runningRun: RunCardData | null;
  releasedRuns: RunCardData[];
}

export function MachineQueueScreen({
  machines,
  initialMachineId,
  runningRun,
  releasedRuns,
}: MachineQueueScreenProps) {
  const router = useRouter();
  const [selectedMachineId, setSelectedMachineId] = React.useState(initialMachineId);
  const [isStartingRunId, setIsStartingRunId] = React.useState<string | null>(null);

  const selectedMachine =
    machines.find((m) => m.id === selectedMachineId) || machines[0];

  const handleStartRun = async (runId: string) => {
    setIsStartingRunId(runId);
    const actionId = `act_start_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      await startProductionRun(runId, actionId);
      toast.success("Production run started!");
      router.push(`/operator/run/${runId}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to start run");
      setIsStartingRunId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Big Machine Picker (Minimum 64px tap targets) */}
      <div className="space-y-2">
        <label className="text-sm font-bold uppercase tracking-wider text-slate-400">
          SELECT YOUR MACHINE
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {machines.map((m) => {
            const isSelected = m.id === selectedMachineId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setSelectedMachineId(m.id);
                  router.push(`/operator?machineId=${m.id}`);
                }}
                className={`p-4 sm:p-5 rounded-2xl border-2 text-left transition-all flex items-center justify-between shadow-md select-none ${
                  isSelected
                    ? "bg-slate-900 border-amber-400 text-white ring-4 ring-amber-400/20"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div>
                  <div className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    {m.name}
                  </div>
                  <div className="text-xs sm:text-sm font-mono font-bold text-amber-400 mt-0.5">
                    {m.code} • {m.maxDeckleInch}&quot; Max Deckle
                  </div>
                </div>
                <Factory
                  className={`h-8 w-8 ${
                    isSelected ? "text-amber-400" : "text-slate-700"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Running Run Card (If any) */}
      {runningRun && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-emerald-400 animate-ping" />
            <label className="text-sm font-bold uppercase tracking-wider text-emerald-400">
              CURRENTLY ACTIVE RUN
            </label>
          </div>

          <div className="p-6 rounded-3xl bg-slate-900 border-2 border-emerald-500 shadow-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="font-mono text-xs uppercase font-bold text-emerald-400">
                  RUN NUMBER
                </span>
                <div className="text-3xl sm:text-4xl font-black font-mono text-white">
                  {runningRun.runNumber}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="px-4 py-2 rounded-2xl bg-amber-400 text-slate-950 font-black text-2xl font-mono shadow">
                  {runningRun.gsm} GSM
                </div>
                <div className="text-right font-mono">
                  <div className="text-xl font-bold text-white">
                    {formatWeightKg(runningRun.totalPlannedKg)}
                  </div>
                  <div className="text-xs text-slate-400">
                    {runningRun.patterns.length} cutting patterns
                  </div>
                </div>
              </div>
            </div>

            {/* Resume Button (64px Height) */}
            <Button
              asChild
              className="w-full h-16 sm:h-20 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-xl sm:text-2xl gap-3 shadow-xl transition-transform active:scale-[0.98]"
            >
              <Link href={`/operator/run/${runningRun.id}`}>
                <Play className="h-7 w-7 fill-white" /> RESUME ACTIVE RUN
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Queue of Released Runs */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-bold uppercase tracking-wider text-slate-400">
            RUN QUEUE FOR {selectedMachine.name} ({releasedRuns.length})
          </label>
          <span className="text-xs font-mono text-slate-500">Scheduled by Planning Desk</span>
        </div>

        {releasedRuns.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-slate-950 border-2 border-dashed border-slate-800 space-y-2">
            <Clock className="h-12 w-12 text-slate-700 mx-auto" />
            <div className="text-lg font-bold text-slate-300">No Released Runs in Queue</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Check with the production planner to release the next scheduled deckle plan.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {releasedRuns.map((run, idx) => {
              const isStarting = isStartingRunId === run.id;
              const trimInfo = formatTrimPercent(run.totalTrimPercent);

              return (
                <div
                  key={run.id}
                  className="p-6 rounded-3xl bg-slate-950 border-2 border-slate-800 hover:border-slate-700 transition-all shadow-xl space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-500 font-bold">
                          QUEUE #{idx + 1}
                        </span>
                        <span className="text-xs font-mono text-slate-400">•</span>
                        <span className="text-xs font-mono text-slate-400">
                          Trim: {Number(run.totalTrimPercent).toFixed(2)}%
                        </span>
                      </div>
                      <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-0.5">
                        {run.runNumber}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="px-4 py-2 rounded-2xl bg-amber-400 text-slate-950 font-black text-2xl font-mono shadow">
                        {run.gsm} GSM
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-lg font-bold text-white">
                          {formatWeightKg(run.totalPlannedKg)}
                        </div>
                        <div className="text-xs text-slate-400">
                          {run.patterns.length} slitter setups
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Start Run Full-Width Button (64px Height) */}
                  <Button
                    type="button"
                    disabled={isStarting || !!runningRun}
                    onClick={() => handleStartRun(run.id)}
                    className="w-full h-16 sm:h-18 rounded-2xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 text-white font-black text-lg sm:text-xl gap-3 shadow-lg transition-transform active:scale-[0.98]"
                  >
                    {isStarting ? (
                      <>
                        <Loader2 className="h-6 w-6 animate-spin" /> STARTING RUN...
                      </>
                    ) : (
                      <>
                        <Play className="h-6 w-6 fill-white" /> START THIS RUN
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
