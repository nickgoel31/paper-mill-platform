"use client";

import * as React from "react";
import {
  Sparkles,
  X,
  Loader2,
  Pencil,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Plus,
  Ruler,
  Scissors,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OptimizeResponse } from "@/lib/solver-client";
import type { TrimOpportunity } from "@/lib/deckle-advisor";
import {
  getTrimAdvice,
  type TrimAdvicePayload,
  type TrimAdviceResult,
} from "@/server/services/trim-advisor-service";

interface AdvisorDemandItem {
  id: string;
  orderNumber: string;
  clientName: string;
  widthInch: number;
  gsm: number;
  quantityKg: number;
  tolerancePercent: number;
}

interface AdvisorMachineOption {
  id: string;
  name: string;
  maxDeckleInch: number;
  minTrimInch: number;
}

interface TrimAdvisorBannerProps {
  solverResult: OptimizeResponse;
  demandItems: AdvisorDemandItem[];
  selectedItemIds: string[];
  machines: AdvisorMachineOption[];
  onEditPattern: (runIndex: number, patternIndex: number) => void;
}

type AdvisorState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: TrimAdviceResult };

const COLLAPSED_COUNT = 3;

const KIND_META: Record<
  TrimOpportunity["kind"],
  { label: string; Icon: typeof Plus; chip: string }
> = {
  FILL_GAP: { label: "Use spare width", Icon: Plus, chip: "bg-sky-50 text-sky-700 border-sky-200" },
  WIDEN_CUT: { label: "Ask client", Icon: Ruler, chip: "bg-violet-50 text-violet-700 border-violet-200" },
  SHORTEN_RUN: { label: "Shorten run", Icon: Scissors, chip: "bg-rose-50 text-rose-700 border-rose-200" },
};

/** Only these can be carried out inside the pattern editor. */
function canOpenEditor(o: TrimOpportunity) {
  if (o.kind === "SHORTEN_RUN") return true;
  if (o.kind === "FILL_GAP") return o.fills.every((f) => f.candidate.source === "PENDING_ORDER");
  return false;
}

export function TrimAdvisorBanner({
  solverResult,
  demandItems,
  selectedItemIds,
  machines,
  onEditPattern,
}: TrimAdvisorBannerProps) {
  const [state, setState] = React.useState<AdvisorState>({ status: "loading" });
  const [dismissedKey, setDismissedKey] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [retryTick, setRetryTick] = React.useState(0);

  const payload = React.useMemo<TrimAdvicePayload>(() => {
    const selected = new Set(selectedItemIds);
    const toItem = (d: AdvisorDemandItem) => ({
      id: d.id,
      orderNumber: d.orderNumber,
      clientName: d.clientName,
      widthInch: d.widthInch,
      gsm: d.gsm,
      quantityKg: d.quantityKg,
      tolerancePercent: d.tolerancePercent,
    });

    return {
      currentTrimPercent: solverResult.summary.total_trim_percent,
      runs: solverResult.runs.flatMap((run) => {
        const machine = machines.find((m) => m.id === run.machine_id);
        if (!machine) return [];
        return [
          {
            machine: {
              id: machine.id,
              name: machine.name,
              maxDeckleInch: machine.maxDeckleInch,
              minTrimInch: machine.minTrimInch,
            },
            gsm: run.gsm,
            patterns: run.patterns.map((p) => ({
              sequence: p.sequence,
              repetitions: p.repetitions,
              runLengthM: p.run_length_m,
              usedWidthInch: p.used_width_inch,
              trimWidthInch: p.trim_width_inch,
              estimatedKg: p.estimated_kg,
              cuts: p.cuts.map((c) => ({
                itemId: c.order_item_id,
                widthInch: c.width_inch,
                count: c.count,
              })),
            })),
          },
        ];
      }),
      planItems: demandItems.filter((d) => selected.has(d.id)).map(toItem),
      candidates: demandItems.filter((d) => !selected.has(d.id)).map(toItem),
    };
  }, [solverResult, demandItems, selectedItemIds, machines]);

  const payloadKey = React.useMemo(() => JSON.stringify(payload), [payload]);

  // Debounced so a burst of manual pattern edits costs one AI call, not several.
  React.useEffect(() => {
    if (payload.runs.length === 0) return;
    let cancelled = false;
    setState({ status: "loading" });
    const timer = setTimeout(async () => {
      try {
        const result = await getTrimAdvice(payload);
        if (!cancelled) setState({ status: "ready", result });
      } catch (err: any) {
        if (!cancelled) {
          setState({ status: "error", message: err?.message || "Could not analyse this plan." });
        }
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // payloadKey captures every input; `payload` identity alone would refire on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey, retryTick]);

  if (payload.runs.length === 0) return null;

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-900">
        <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
        <span className="font-semibold">AI is checking this plan for trim you can still cut by hand…</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <span>Trim advisor unavailable: {state.message}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setRetryTick((t) => t + 1)}
          className="h-7 gap-1 rounded-lg text-xs"
        >
          <RotateCcw className="h-3 w-3" /> Retry
        </Button>
      </div>
    );
  }

  const { result } = state;
  const { advice } = result;

  if (advice.opportunities.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-xs text-emerald-900">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <span className="font-semibold">
          AI check: is plan me hand se aur trim kam karne ka koi practical mauka nahi mila.
        </span>
      </div>
    );
  }

  if (dismissedKey === payloadKey) return null;

  const visible = expanded ? advice.opportunities : advice.opportunities.slice(0, COLLAPSED_COUNT);
  const hidden = advice.opportunities.length - visible.length;
  const showsTrimGain = result.potentialTrimPercent < result.currentTrimPercent - 0.05;

  return (
    <div className="rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50/40 p-4 sm:p-5 shadow-[0_1px_4px_rgba(180,83,9,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-8 w-8 rounded-xl bg-amber-400/25 text-amber-700 flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-amber-950">AI Trim Advisor</h3>
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-200/70 text-amber-900">
                Needs a person to act
              </span>
            </div>
            <p className="text-xs text-amber-900/90 leading-relaxed font-medium">{result.headline}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss trim advice"
          onClick={() => setDismissedKey(payloadKey)}
          className="rounded-lg p-1 text-amber-700/70 hover:bg-amber-200/50 hover:text-amber-900 transition-colors shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {showsTrimGain && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-amber-200 px-2.5 py-1 text-[11px] font-mono font-bold text-slate-800">
            <TrendingDown className="h-3.5 w-3.5 text-emerald-600" />
            Trim {result.currentTrimPercent.toFixed(2)}% → ~{result.potentialTrimPercent.toFixed(2)}%
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-amber-200 px-2.5 py-1 text-[11px] font-mono font-bold text-slate-800">
          ~{Math.round(advice.totalWasteSavedKg).toLocaleString("en-IN")} kg paper saved
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {visible.map((o) => {
          const meta = KIND_META[o.kind];
          return (
            <li
              key={o.id}
              className="flex items-start gap-3 rounded-xl border border-amber-100 bg-white/80 p-3 text-xs"
            >
              <span
                className={`inline-flex items-center gap-1 shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${meta.chip}`}
              >
                <meta.Icon className="h-3 w-3" />
                {meta.label}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-slate-800 leading-relaxed">{result.tips[o.id]}</p>
                <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                  <span>
                    Run #{o.runIndex + 1} · Pattern {o.patternSequence}
                  </span>
                  <span>•</span>
                  <span className="font-bold text-emerald-700">
                    ~{Math.round(o.wasteSavedKg).toLocaleString("en-IN")} kg
                  </span>
                </div>
              </div>
              {canOpenEditor(o) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onEditPattern(o.runIndex, o.patternIndex)}
                  className="h-7 shrink-0 gap-1 rounded-lg bg-white text-[11px] font-bold"
                >
                  <Pencil className="h-3 w-3" /> Edit pattern
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex items-center justify-between gap-3">
        {advice.opportunities.length > COLLAPSED_COUNT ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 hover:text-amber-950"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" /> Show fewer
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" /> Show {hidden} more
              </>
            )}
          </button>
        ) : (
          <span />
        )}
        <span className="text-[10px] italic text-amber-700/80">
          {result.aiGenerated
            ? "Numbers computed from your plan • wording by AI"
            : "Numbers computed from your plan • AI wording unavailable"}
        </span>
      </div>
    </div>
  );
}
