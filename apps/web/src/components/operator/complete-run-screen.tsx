"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { offlineCompleteProductionRun } from "@/lib/offline/wrapped-actions";
import { formatWeightKg, formatTrimPercent } from "@/lib/utils";
import { FullscreenNumpad } from "./fullscreen-numpad";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  PartyPopper,
  Scale,
  RotateCcw,
  Scissors,
  Layers,
  ArrowRight,
  Loader2,
  AlertCircle,
} from "lucide-react";

type Destination = "AUTO_DISPATCH" | "INVENTORY";

interface CompleteRunScreenProps {
  run: any;
  /** The mill's default routing for finished reels. */
  defaultDestination?: Destination;
}

const WASTAGE_REASONS = [
  { id: "TRIM_WASTE", label: "Normal Edge Trim" },
  { id: "PAPER_BREAK", label: "Paper Web Break / Slitter Jam" },
  { id: "QUALITY_REJECT", label: "Quality / GSM Out of Tolerance" },
  { id: "OTHER", label: "Setup / Roll Tail" },
];

export function CompleteRunScreen({
  run,
  defaultDestination = "AUTO_DISPATCH",
}: CompleteRunScreenProps) {
  const router = useRouter();
  const [destination, setDestination] = React.useState<Destination>(defaultDestination);
  const toInventory = destination === "INVENTORY";

  // Theoretical calculated total planned weight and trim waste
  const totalPlannedKg = Number(run.totalPlannedKg) || 0;
  const trimPct = Number(run.totalTrimPercent) || 0;
  const theoreticalTrimKg = Math.round(totalPlannedKg * (trimPct / 100));

  // Operator adjustable actual weight & trim waste
  const [actualTotalKg, setActualTotalKg] = React.useState<number>(
    Number(run.totalActualKg) > 0 ? Number(run.totalActualKg) : totalPlannedKg
  );
  const [trimWasteKg, setTrimWasteKg] = React.useState<number>(theoreticalTrimKg);
  const [selectedReason, setSelectedReason] = React.useState<string>("TRIM_WASTE");

  // Numpad state
  const [numpadOpen, setNumpadOpen] = React.useState(false);
  const [numpadMode, setNumpadMode] = React.useState<"ACTUAL_KG" | "TRIM_KG">("ACTUAL_KG");

  // Execution state
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [isQueued, setIsQueued] = React.useState(false);

  // Variance calculation
  const varianceKg = actualTotalKg - totalPlannedKg;
  const variancePct = totalPlannedKg > 0 ? (varianceKg / totalPlannedKg) * 100 : 0;

  const handleFinalize = async () => {
    setIsSubmitting(true);
    const actionId = `act_complete_${run.id}_${Date.now()}`;

    try {
      const result = await offlineCompleteProductionRun({
        runId: run.id,
        actualKg: actualTotalKg,
        trimWasteKg: trimWasteKg,
        wastageReason: selectedReason,
        destination,
        actionId,
      });

      if (result.queued) {
        // Reel/inventory allocation happens server-side, so we can't show the
        // "reels added to inventory" success screen until this actually syncs.
        setIsQueued(true);
        toast.info("Offline — run completion saved locally and will sync automatically.");
      } else {
        setIsSuccess(true);
        toast.success(`Production Run #${run.runNumber} marked COMPLETED.`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to finalize production run");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isQueued) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-6 select-none">
        <div className="p-8 sm:p-12 rounded-3xl bg-slate-900 border-4 border-amber-500 shadow-2xl space-y-6">
          <div className="h-24 w-24 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center mx-auto shadow-xl">
            <AlertCircle className="h-16 w-16 stroke-[3]" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              RUN #{run.runNumber} QUEUED
            </h1>
            <p className="text-base sm:text-lg text-amber-400 font-mono font-bold">
              Saved on this device. Reels will be added to inventory once this
              tablet reconnects and syncs.
            </p>
          </div>

          <Button
            asChild
            className="w-full h-16 sm:h-20 rounded-2xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xl sm:text-2xl gap-3 shadow-xl"
          >
            <Link href="/operator">
              <RotateCcw className="h-7 w-7" /> RETURN TO MACHINE QUEUE
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // Big Celebratory Success Screen
  if (isSuccess) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-6 select-none">
        <div className="p-8 sm:p-12 rounded-3xl bg-slate-900 border-4 border-emerald-500 shadow-2xl space-y-6">
          <div className="h-24 w-24 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center mx-auto shadow-xl animate-bounce">
            <CheckCircle2 className="h-16 w-16 stroke-[3]" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              RUN #{run.runNumber} COMPLETED!
            </h1>
            <p className="text-base sm:text-lg text-emerald-400 font-mono font-bold">
              {formatWeightKg(actualTotalKg)} output recorded & reels added to inventory.
            </p>
          </div>

          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 grid grid-cols-2 gap-4 text-center font-mono">
            <div>
              <span className="text-xs text-slate-500 font-sans uppercase">CUSTOMER ORDERS</span>
              <div className="text-xl font-bold text-white">
                {toInventory ? "Awaiting allocation" : "Updated to Produced"}
              </div>
            </div>
            <div>
              <span className="text-xs text-slate-500 font-sans uppercase">FINISHED REELS</span>
              <div className="text-xl font-bold text-amber-400">
                {toInventory ? "Stored in Inventory" : "Allocated to Bays"}
              </div>
            </div>
          </div>

          <Button
            asChild
            className="w-full h-16 sm:h-20 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-xl sm:text-2xl gap-3 shadow-xl"
          >
            <Link href="/operator">
              <RotateCcw className="h-7 w-7" /> RETURN TO MACHINE QUEUE
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-slate-900 border-2 border-slate-700 shadow-xl space-y-2">
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">
          RUN FINALIZATION & INVENTORY ALLOCATION
        </span>
        <div className="text-3xl sm:text-4xl font-black font-mono text-white">
          Complete Run #{run.runNumber}
        </div>
        <p className="text-sm font-mono text-slate-400">
          Machine: <strong>{run.machine.name}</strong> • {run.gsm} GSM
        </p>
      </div>

      {/* Production Output Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Planned vs Actual */}
        <div className="p-6 rounded-3xl bg-slate-950 border-2 border-slate-800 space-y-4">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
            FINISHED OUTPUT WEIGHT
          </span>
          <div className="flex items-baseline justify-between">
            <div className="text-4xl font-black font-mono text-emerald-400">
              {formatWeightKg(actualTotalKg)}
            </div>
            <div className="text-right font-mono text-xs text-slate-400">
              Target: {formatWeightKg(totalPlannedKg)}
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setNumpadMode("ACTUAL_KG");
              setNumpadOpen(true);
            }}
            className="h-14 w-full rounded-2xl bg-slate-900 hover:bg-slate-800 text-white border-slate-700 text-base font-bold gap-2"
          >
            <Scale className="h-5 w-5 text-emerald-400" /> Adjust Final Weight (Numpad)
          </Button>
        </div>

        {/* Trim & Scrap Wastage Log */}
        <div className="p-6 rounded-3xl bg-slate-950 border-2 border-slate-800 space-y-4">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
            EDGE TRIM & SCRAP WEIGHT
          </span>
          <div className="flex items-baseline justify-between">
            <div className="text-4xl font-black font-mono text-amber-400">
              {formatWeightKg(trimWasteKg)}
            </div>
            <div className="text-right font-mono text-xs text-slate-400">
              Theoretical: {formatWeightKg(theoreticalTrimKg)}
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setNumpadMode("TRIM_KG");
              setNumpadOpen(true);
            }}
            className="h-14 w-full rounded-2xl bg-slate-900 hover:bg-slate-800 text-white border-slate-700 text-base font-bold gap-2"
          >
            <Scissors className="h-5 w-5 text-amber-400" /> Adjust Trim Weight (Numpad)
          </Button>
        </div>
      </div>

      {/* Wastage Reason Presets (Big Touch Buttons) */}
      <div className="p-6 rounded-3xl bg-slate-950 border-2 border-slate-800 space-y-3">
        <label className="text-sm font-bold uppercase tracking-wider text-slate-400">
          SELECT PRIMARY WASTAGE CLASSIFICATION
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {WASTAGE_REASONS.map((r) => {
            const isSelected = selectedReason === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedReason(r.id)}
                className={`p-4 rounded-2xl border-2 text-left font-bold text-base transition-all select-none ${
                  isSelected
                    ? "bg-amber-400/10 border-amber-400 text-amber-300 ring-2 ring-amber-400/20"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Where do the finished reels go? Defaults to the mill setting. */}
      <div className="p-6 rounded-3xl bg-slate-950 border-2 border-slate-800 space-y-3">
        <label className="text-sm font-bold uppercase tracking-wider text-slate-400">
          WHERE DO THE FINISHED REELS GO?
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(
            [
              {
                id: "AUTO_DISPATCH",
                label: "Allocate to Orders",
                hint: "Reels go straight to their sales orders, ready for dispatch.",
              },
              {
                id: "INVENTORY",
                label: "Store in Inventory",
                hint: "Reels are stored; match them to orders later from Stock.",
              },
            ] as { id: Destination; label: string; hint: string }[]
          ).map((d) => {
            const isSelected = destination === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setDestination(d.id)}
                className={`p-4 rounded-2xl border-2 text-left transition-all select-none ${
                  isSelected
                    ? "bg-emerald-400/10 border-emerald-400 text-emerald-300 ring-2 ring-emerald-400/20"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className="font-bold text-base">{d.label}</div>
                <div className="text-xs font-normal mt-1 opacity-80">{d.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Full-Width "Complete Run" Button (64px+ Height) */}
      <div className="pt-2">
        <Button
          type="button"
          disabled={isSubmitting}
          onClick={handleFinalize}
          className="w-full h-18 sm:h-22 rounded-3xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-2xl sm:text-3xl gap-4 shadow-2xl transition-transform active:scale-[0.98]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin" /> ALLOCATING REELS & COMPLETING...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-9 w-9 stroke-[3]" /> COMPLETE RUN & LOG REELS
            </>
          )}
        </Button>
      </div>

      {/* Fullscreen Touch Numpad */}
      <FullscreenNumpad
        open={numpadOpen}
        onOpenChange={setNumpadOpen}
        title={
          numpadMode === "ACTUAL_KG"
            ? "Enter Total Actual Finished Weight"
            : "Enter Total Trim Waste Weight"
        }
        initialValue={numpadMode === "ACTUAL_KG" ? actualTotalKg : trimWasteKg}
        unit="kg"
        onConfirm={(val) => {
          if (numpadMode === "ACTUAL_KG") {
            setActualTotalKg(val);
          } else {
            setTrimWasteKg(val);
          }
        }}
      />
    </div>
  );
}
