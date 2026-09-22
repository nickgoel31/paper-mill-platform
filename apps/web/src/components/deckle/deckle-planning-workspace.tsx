"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { formatWeightKg, formatTrimPercent, formatWidthInch } from "@/lib/utils";
import {
  runSolverOptimization,
  commitProductionRuns,
  getMatchableInventory,
} from "@/server/services/deckle-service";
import {
  matchInventoryToDemand,
  type InventoryAllocation,
} from "@/lib/deckle-inventory-match";
import { InventoryUsageDialog } from "./inventory-usage-dialog";
import { explainPlan, AIExplanationResult } from "@/server/services/ai-explain-service";
import {
  OptimizeResponse,
  ProductionRunResult,
  PatternResult,
} from "@/lib/solver-client";
import { PatternBar } from "./pattern-bar";
import { PatternOverrideDialog } from "./pattern-override-dialog";
import { TrimAdvisorBanner } from "./trim-advisor-banner";
import { StockMatchBanner, StockMatchForDemand } from "./stock-match-banner";
import { OrderPriority, Role } from "@/generated/prisma/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Scissors,
  Layers,
  Sparkles,
  Info,
  CheckCircle2,
  AlertTriangle,
  Play,
  ArrowRight,
  RotateCcw,
  Pencil,
  ChevronDown,
  ChevronRight,
  Loader2,
  Cpu,
  TrendingDown,
  Gauge,
  Factory,
  Save,
  Clock,
  Zap,
} from "lucide-react";

interface DemandItem {
  id: string;
  orderId: string;
  orderNumber: string;
  clientName: string;
  clientCode: string;
  clientCity: string;
  widthInch: number;
  gsm: number;
  quantityKg: number;
  tolerancePercent: number;
  producedKg: number;
  deliveryDate: Date | string | null;
  orderDate: Date | string | null;
  priority: OrderPriority;
}

interface MachineOption {
  id: string;
  name: string;
  code: string;
  maxDeckleInch: number;
  minDeckleInch: number;
  minTrimInch: number;
  maxTrimInch: number;
  trimMode?: "BOTH_SIDES" | "ONE_SIDE";
  minGsm: number;
  maxGsm: number;
}

interface DecklePlanningWorkspaceProps {
  demandItems: DemandItem[];
  machines: MachineOption[];
  userRole: Role;
  stockMatches?: StockMatchForDemand[];
}

export function DecklePlanningWorkspace({
  demandItems,
  stockMatches = [],
  machines,
  userRole,
}: DecklePlanningWorkspaceProps) {
  const router = useRouter();

  // Step state: 1 = Select Demand, 2 = Configure & Run, 3 = Review & Override
  const [currentStep, setCurrentStep] = React.useState<1 | 2 | 3>(1);

  // Demand Selection State
  const [selectedItemIds, setSelectedItemIds] = React.useState<string[]>(
    demandItems.map((it) => it.id)
  );
  const [collapsedGsms, setCollapsedGsms] = React.useState<Record<number, boolean>>({});

  // Solver Configuration State
  const [selectedMachineIds, setSelectedMachineIds] = React.useState<string[]>(
    machines.map((m) => m.id)
  );
  const [objective, setObjective] = React.useState<"MIN_TRIM" | "MIN_PATTERNS" | "BALANCED">("MIN_TRIM");
  const [maxPatternsPerRun, setMaxPatternsPerRun] = React.useState<number>(20);
  const [maxDistinctWidths, setMaxDistinctWidths] = React.useState<number>(6);
  const [allowOverproduction, setAllowOverproduction] = React.useState<boolean>(true);
  const [useStockPresets, setUseStockPresets] = React.useState<boolean>(false);
  const [timeLimitSeconds, setTimeLimitSeconds] = React.useState<number>(30);
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  // Solving & Results State
  const [isSolving, setIsSolving] = React.useState(false);
  const [solveElapsedSeconds, setSolveElapsedSeconds] = React.useState(0);
  const [solverResult, setSolverResult] = React.useState<OptimizeResponse | null>(null);
  const [lastPayload, setLastPayload] = React.useState<any>(null);

  // Manual Override State
  const [overrideModalOpen, setOverrideModalOpen] = React.useState(false);
  const [activeOverrideTarget, setActiveOverrideTarget] = React.useState<{
    runIndex: number;
    patternIndex: number;
    pattern: PatternResult;
  } | null>(null);

  // AI Explanation State
  const [aiExplanations, setAiExplanations] = React.useState<Record<number, AIExplanationResult>>({});
  const [isGeneratingAi, setIsGeneratingAi] = React.useState<Record<number, boolean>>({});
  const [showAiPanel, setShowAiPanel] = React.useState<Record<number, boolean>>({});

  // Committing State
  const [isCommitting, setIsCommitting] = React.useState(false);

  // Inventory-first: free reels that were matched to orders instead of being produced.
  const [inventoryAllocs, setInventoryAllocs] = React.useState<InventoryAllocation[]>([]);
  const [inventoryDialogOpen, setInventoryDialogOpen] = React.useState(false);
  // The planner has approved the listed reels (required before committing).
  const [inventoryApproved, setInventoryApproved] = React.useState(false);

  // Timer for solving elapsed indicator
  React.useEffect(() => {
    let interval: any;
    if (isSolving) {
      setSolveElapsedSeconds(0);
      interval = setInterval(() => {
        setSolveElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSolving]);

  // Group demand items by GSM
  const gsmGroups = React.useMemo(() => {
    const map = new Map<number, DemandItem[]>();
    demandItems.forEach((it) => {
      if (!map.has(it.gsm)) map.set(it.gsm, []);
      map.get(it.gsm)!.push(it);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [demandItems]);

  // Selected items objects
  const selectedItems = React.useMemo(() => {
    return demandItems.filter((it) => selectedItemIds.includes(it.id));
  }, [demandItems, selectedItemIds]);

  const selectedTotalKg = selectedItems.reduce((acc, it) => acc + it.quantityKg, 0);
  const selectedDistinctGsms = Array.from(new Set(selectedItems.map((it) => it.gsm)));

  // Toggle single item selection
  const handleToggleItem = (id: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Toggle group selection
  const handleToggleGroup = (gsm: number, items: DemandItem[]) => {
    const groupIds = items.map((i) => i.id);
    const allSelected = groupIds.every((id) => selectedItemIds.includes(id));
    if (allSelected) {
      setSelectedItemIds((prev) => prev.filter((id) => !groupIds.includes(id)));
    } else {
      setSelectedItemIds((prev) => Array.from(new Set([...prev, ...groupIds])));
    }
  };

  // Color mapping for orders
  const orderColorMap = React.useMemo(() => {
    const colors = [
      "bg-sky-500 text-white",
      "bg-emerald-500 text-white",
      "bg-purple-500 text-white",
      "bg-amber-500 text-white",
      "bg-blue-600 text-white",
      "bg-rose-500 text-white",
      "bg-indigo-500 text-white",
      "bg-teal-500 text-white",
    ];
    const map: Record<string, string> = {};
    const distinctOrders = Array.from(new Set(demandItems.map((it) => it.orderNumber)));
    distinctOrders.forEach((num, idx) => {
      map[num] = colors[idx % colors.length];
    });
    return map;
  }, [demandItems]);

  // Execute Solver. `excludedReelIds` are inventory reels the planner declined to use.
  const handleRunOptimization = async (excludedReelIds: string[] = []) => {
    if (selectedItems.length === 0) {
      toast.error("Please select at least one demand item for deckle planning.");
      return;
    }

    const chosenMachines = machines.filter((m) => selectedMachineIds.includes(m.id));
    if (chosenMachines.length === 0) {
      toast.error("Please select at least one eligible machine.");
      return;
    }

    setIsSolving(true);

    // Inventory first: match free reels to the selected orders so only the
    // remaining demand goes to the solver.
    let match = matchInventoryToDemand(selectedItems, [], new Set());
    try {
      const reels = await getMatchableInventory();
      match = matchInventoryToDemand(selectedItems, reels, new Set(excludedReelIds));
    } catch {
      toast.warning("Couldn't check inventory — planning full production instead.");
    }
    setInventoryAllocs(match.allocations);
    setInventoryApproved(false);

    const payload = {
      machines: chosenMachines.map((m) => ({
        id: m.id,
        name: m.name,
        max_deckle_inch: m.maxDeckleInch,
        min_deckle_inch: m.minDeckleInch,
        min_trim_inch: m.minTrimInch,
        max_trim_inch: m.maxTrimInch,
        min_gsm: m.minGsm,
        max_gsm: m.maxGsm,
      })),
      items: match.remainingItems.map((it) => ({
        order_item_id: it.id,
        order_number: it.orderNumber,
        width_inch: it.widthInch,
        gsm: it.gsm,
        // Net out anything already produced AND anything the inventory
        // pre-check just matched, so we don't ask the solver to cut kg
        // that's already accounted for either way.
        quantity_kg: Math.max(0, it.solverQuantityKg - it.producedKg),
        tolerance_percent: it.tolerancePercent,
        priority: it.priority,
        delivery_date: it.deliveryDate ? new Date(it.deliveryDate).toISOString().split("T")[0] : null,
        order_date: it.orderDate ? new Date(it.orderDate).toISOString().split("T")[0] : null,
      })),
      options: {
        objective,
        max_patterns_per_run: maxPatternsPerRun,
        max_distinct_widths_per_pattern: maxDistinctWidths,
        allow_overproduction: allowOverproduction,
        use_stock_presets: useStockPresets,
        time_limit_seconds: timeLimitSeconds,
      },
    };

    setLastPayload(payload);

    try {
      if (payload.items.length === 0) {
        // Inventory covers everything selected — nothing for the solver to cut.
        setSolverResult({
          runs: [],
          unassigned_items: [],
          summary: {
            total_trim_percent: 0,
            total_kg: 0,
            machines_used: 0,
            runs_created: 0,
            solve_time_ms: 0,
          },
          warnings: [],
        });
        setCurrentStep(3);
        toast.success("Inventory covers all selected orders — no new production needed.");
      } else {
        const result = await runSolverOptimization(payload as any);
        setSolverResult(result);
        setCurrentStep(3);
        toast.success(
          `Optimization solved in ${(result.summary.solve_time_ms / 1000).toFixed(2)}s with ${result.summary.total_trim_percent}% average trim waste!`
        );
      }
      if (match.allocations.length > 0) setInventoryDialogOpen(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to run deckle optimization solver");
    } finally {
      setIsSolving(false);
    }
  };

  // Handle Pattern Manual Override Save
  const handleSavePatternOverride = (updatedPattern: PatternResult) => {
    if (!activeOverrideTarget || !solverResult) return;
    const { runIndex, patternIndex } = activeOverrideTarget;

    const newRuns = [...solverResult.runs];
    const targetRun = { ...newRuns[runIndex] };
    const newPatterns = [...targetRun.patterns];
    newPatterns[patternIndex] = updatedPattern;

    const runTotalKg = newPatterns.reduce((acc, p) => acc + p.estimated_kg, 0);
    const runTotalTrimPct =
      runTotalKg > 0
        ? newPatterns.reduce((acc, p) => acc + p.trim_percent * p.estimated_kg, 0) / runTotalKg
        : 0;

    targetRun.patterns = newPatterns;
    targetRun.total_planned_kg = Number(runTotalKg.toFixed(2));
    targetRun.total_trim_percent = Number(runTotalTrimPct.toFixed(2));
    newRuns[runIndex] = targetRun;

    const overallKg = newRuns.reduce((acc, r) => acc + r.total_planned_kg, 0);
    const overallTrimPct =
      overallKg > 0
        ? newRuns.reduce((acc, r) => acc + r.total_trim_percent * r.total_planned_kg, 0) / overallKg
        : 0;

    setSolverResult({
      ...solverResult,
      runs: newRuns,
      summary: {
        ...solverResult.summary,
        total_kg: Number(overallKg.toFixed(2)),
        total_trim_percent: Number(overallTrimPct.toFixed(2)),
      },
    });

    toast.success(`Pattern #${updatedPattern.sequence} updated. Trim recomputed.`);
  };

  // Open the manual pattern editor for a given pattern (used by the trim advisor)
  const handleEditPatternFromAdvisor = (runIndex: number, patternIndex: number) => {
    const pattern = solverResult?.runs[runIndex]?.patterns[patternIndex];
    if (!pattern) return;
    setActiveOverrideTarget({ runIndex, patternIndex, pattern });
    setOverrideModalOpen(true);
  };

  // Generate AI Explanation
  const handleGenerateAiExplanation = async (runIndex: number) => {
    if (!solverResult || !solverResult.runs[runIndex]) return;
    const run = solverResult.runs[runIndex];
    const machine = machines.find((m) => m.id === run.machine_id) || machines[0];

    setIsGeneratingAi((prev) => ({ ...prev, [runIndex]: true }));
    setShowAiPanel((prev) => ({ ...prev, [runIndex]: true }));

    try {
      const explanation = await explainPlan({
        machineName: machine.name,
        deckleInch: machine.maxDeckleInch,
        gsm: run.gsm,
        totalTrimPercent: run.total_trim_percent,
        totalPlannedKg: run.total_planned_kg,
        patterns: run.patterns.map((p) => ({
          sequence: p.sequence,
          usedWidthInch: p.used_width_inch,
          trimWidthInch: p.trim_width_inch,
          trimPercent: p.trim_percent,
          repetitions: p.repetitions,
          estimatedKg: p.estimated_kg,
          cuts: p.cuts.map((c) => {
            const it = demandItems.find((d) => d.id === c.order_item_id);
            return {
              orderNumber: it?.orderNumber,
              widthInch: c.width_inch,
              count: c.count,
            };
          }),
        })),
        unassignedCount: solverResult.unassigned_items.length,
      });

      setAiExplanations((prev) => ({ ...prev, [runIndex]: explanation }));
      toast.success("AI plan explanation generated.");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate AI plan analysis");
    } finally {
      setIsGeneratingAi((prev) => ({ ...prev, [runIndex]: false }));
    }
  };

  // Commit Production Runs
  const handleCommitRuns = async () => {
    if (!solverResult) return;
    if (solverResult.runs.length === 0 && inventoryAllocs.length === 0) return;
    if (inventoryAllocs.length > 0 && !inventoryApproved) {
      setInventoryDialogOpen(true);
      toast.info("Please review and approve the inventory reels first.");
      return;
    }

    setIsCommitting(true);
    try {
      const commitPayload = {
        solverPayload: {
          request: lastPayload,
          response: solverResult,
        },
        stockAllocations: inventoryAllocs.map((a) => ({
          stockItemId: a.stockItemId,
          orderItemId: a.orderItemId,
        })),
        runs: solverResult.runs.map((r) => ({
          machineId: r.machine_id,
          gsm: r.gsm,
          totalTrimPercent: r.total_trim_percent,
          totalPlannedKg: r.total_planned_kg,
          patterns: r.patterns.map((p) => ({
            sequence: p.sequence,
            repetitions: p.repetitions,
            runLengthM: p.run_length_m || (p.repetitions * 1000.0),
            usedWidthInch: p.used_width_inch,
            trimWidthInch: p.trim_width_inch,
            trimPercent: p.trim_percent,
            estimatedKg: p.estimated_kg,
            isManuallyEdited: p.is_manually_edited,
            cuts: p.cuts.map((c) => ({
              orderItemId: c.order_item_id,
              widthInch: c.width_inch,
              count: c.count,
            })),
          })),
        })),
      };

      const res = await commitProductionRuns(commitPayload);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      const parts: string[] = [];
      if (res.runCount > 0) {
        parts.push(`${res.runCount} production run(s) with ${res.patternCount} cutting patterns`);
      }
      if (res.allocatedReels > 0) {
        parts.push(`${res.allocatedReels} inventory reel(s) allocated to orders`);
      }
      toast.success(`Committed: ${parts.join(" and ")}.`);
      router.push(res.runCount > 0 ? "/production" : "/orders");
    } catch (err: any) {
      toast.error(err.message || "Failed to commit production runs");
    } finally {
      setIsCommitting(false);
    }
  };

  const heroTrimBenchmark = solverResult
    ? formatTrimPercent(solverResult.summary.total_trim_percent)
    : null;

  return (
    <div className="space-y-6 font-sans pb-10">
      {/* 1. TOP HERO BANNER */}
      <div className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-[11px] font-bold uppercase tracking-wide">
            STEP 2 • DECKLE OPTIMIZATION & SLITTING ENGINE
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Scissors className="h-7 w-7 text-sky-500" />
            Deckle Planning & Cutting Optimizer
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl font-medium">
            Mathematically combine order widths across dynamic machine deckles to minimize trim waste (Rule A & Rule B).
          </p>
        </div>

        {/* 3 Step Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentStep(1)}
            className={`h-9 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              currentStep === 1
                ? "bg-[#161622] text-[#d4f842] shadow-md shadow-[#161622]/20"
                : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80"
            }`}
          >
            1. Select Demand ({selectedItems.length})
          </button>
          <ArrowRight className="h-3.5 w-3.5 text-slate-300 hidden sm:block" />
          <button
            type="button"
            onClick={() => setCurrentStep(2)}
            className={`h-9 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              currentStep === 2
                ? "bg-[#161622] text-[#d4f842] shadow-md shadow-[#161622]/20"
                : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80"
            }`}
          >
            2. Configure & Solve
          </button>
          <ArrowRight className="h-3.5 w-3.5 text-slate-300 hidden sm:block" />
          <button
            type="button"
            disabled={!solverResult}
            onClick={() => setCurrentStep(3)}
            className={`h-9 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              currentStep === 3
                ? "bg-[#161622] text-[#d4f842] shadow-md shadow-[#161622]/20"
                : solverResult
                ? "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80"
                : "bg-slate-50 text-slate-300 border border-slate-100 cursor-not-allowed"
            }`}
          >
            3. Results & Visualizer
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* STEP 1: SELECT DEMAND */}
      {/* ========================================================================= */}
      {currentStep === 1 && (
        <div className="space-y-5">
          {/* Rule A Explanation Chip */}
          <div className="bg-sky-50/70 border border-sky-100 rounded-2xl p-4 flex items-start gap-3 text-xs text-sky-950">
            <Info className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold">RULE A — Single GSM per Run Constraint:</strong>
              <p className="text-slate-600 mt-0.5">
                Paper machines produce one GSM grade per run. Each GSM grade selected below will be partitioned into its own independent production run automatically.
              </p>
            </div>
          </div>

          {/* Stock-first check: don't cut what's already in the warehouse */}
          <StockMatchBanner
            matches={stockMatches}
            demandItems={demandItems}
            onAssigned={() => router.refresh()}
          />

          {/* GSM Grouped Demand Table */}
          {demandItems.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
              <Layers className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <h3 className="font-bold text-slate-800 text-sm">No Pending Confirmed Demands Found</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                All confirmed orders have already been scheduled. Create or confirm new sales orders to populate demand.
              </p>
              <Button asChild size="sm" className="mt-4 rounded-xl bg-[#161622] hover:bg-[#202030] text-white font-bold text-xs shadow-xs">
                <Link href="/orders/new">Create Sales Order</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {gsmGroups.map(([gsm, items]) => {
                const isCollapsed = !!collapsedGsms[gsm];
                const groupSelectedCount = items.filter((i) =>
                  selectedItemIds.includes(i.id)
                ).length;
                const isAllSelected = groupSelectedCount === items.length;
                const isSomeSelected = groupSelectedCount > 0 && !isAllSelected;
                const groupKg = items.reduce((acc, i) => acc + i.quantityKg, 0);

                return (
                  <div
                    key={gsm}
                    className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] overflow-hidden"
                  >
                    {/* Collapsible Header */}
                    <div className="p-4 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={isAllSelected ? true : isSomeSelected ? "indeterminate" : false}
                          onCheckedChange={() => handleToggleGroup(gsm, items)}
                          id={`group-${gsm}`}
                          className="rounded-md"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedGsms((prev) => ({ ...prev, [gsm]: !prev[gsm] }))
                          }
                          className="flex items-center gap-2 font-bold text-sm text-slate-900 hover:text-sky-600 transition-colors"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          )}
                          <span className="font-mono bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 text-sky-600 font-bold text-xs">
                            {gsm} GSM
                          </span>
                          <span className="text-slate-700">
                            • {items.length} sizes, {(groupKg / 1000).toFixed(2)} MT ({formatWeightKg(groupKg)})
                          </span>
                        </button>
                      </div>

                      <span className="text-xs font-mono text-slate-400">
                        {groupSelectedCount} of {items.length} selected
                      </span>
                    </div>

                    {/* Table Body */}
                    {!isCollapsed && (
                      <Table>
                        <TableHeader className="bg-slate-50/30">
                          <TableRow className="text-[11px] font-bold text-slate-500 uppercase">
                            <TableHead className="w-[44px] text-center"></TableHead>
                            <TableHead>Order No.</TableHead>
                            <TableHead>Client & Destination</TableHead>
                            <TableHead className="text-right">Width (Inches)</TableHead>
                            <TableHead className="text-right">Quantity (kg)</TableHead>
                            <TableHead className="text-right">Tolerance</TableHead>
                            <TableHead>Delivery Target</TableHead>
                            <TableHead>Priority</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((it) => {
                            const isSelected = selectedItemIds.includes(it.id);
                            return (
                              <TableRow
                                key={it.id}
                                className={`text-xs transition-colors hover:bg-slate-50/50 ${
                                  isSelected ? "bg-sky-50/20" : "opacity-60"
                                }`}
                              >
                                <TableCell className="text-center">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => handleToggleItem(it.id)}
                                    className="rounded-md"
                                  />
                                </TableCell>
                                <TableCell className="font-mono font-bold text-sky-600">
                                  {it.orderNumber}
                                </TableCell>
                                <TableCell>
                                  <div className="font-bold text-slate-900">{it.clientName}</div>
                                  <div className="text-[11px] font-mono text-slate-400">
                                    {it.clientCode} • {it.clientCity}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-mono font-black text-slate-900 text-sm">
                                  {formatWidthInch(it.widthInch)}
                                </TableCell>
                                <TableCell className="text-right font-mono font-bold text-slate-900">
                                  {formatWeightKg(it.quantityKg)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs text-slate-500">
                                  ±{it.tolerancePercent.toFixed(1)}%
                                </TableCell>
                                <TableCell className="font-mono text-xs text-slate-500">
                                  {it.deliveryDate
                                    ? new Date(it.deliveryDate).toLocaleDateString("en-IN")
                                    : "Open"}
                                </TableCell>
                                <TableCell>
                                  <span
                                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                      it.priority === "URGENT"
                                        ? "bg-rose-50 text-rose-700 border border-rose-200"
                                        : "bg-slate-100 text-slate-700"
                                    }`}
                                  >
                                    {it.priority}
                                  </span>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Sticky Bottom Floating Bar */}
          <div className="sticky bottom-4 z-20 p-4 sm:p-5 bg-[#161622] text-white rounded-[24px] border border-white/[0.08] shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <span className="text-[10px] text-slate-400 block font-sans font-bold uppercase">SELECTED SIZES</span>
                <strong className="text-base text-white font-mono">{selectedItems.length} Reels</strong>
              </div>
              <div className="h-6 w-px bg-white/10 hidden sm:block" />
              <div>
                <span className="text-[10px] text-slate-400 block font-sans font-bold uppercase">TOTAL PLANNED WEIGHT</span>
                <strong className="text-base text-[#d4f842] font-mono">
                  {(selectedTotalKg / 1000).toFixed(2)} MT <span className="text-xs text-slate-400 font-sans">({formatWeightKg(selectedTotalKg)})</span>
                </strong>
              </div>
              <div className="h-6 w-px bg-white/10 hidden sm:block" />
              <div>
                <span className="text-[10px] text-slate-400 block font-sans font-bold uppercase">DISTINCT GSM RUNS</span>
                <strong className="text-base text-emerald-400 font-mono">
                  {selectedDistinctGsms.length} {selectedDistinctGsms.length === 1 ? "Run" : "Runs"}
                </strong>
              </div>
            </div>

            <Button
              disabled={selectedItems.length === 0}
              onClick={() => setCurrentStep(2)}
              className="bg-[#d4f842] hover:bg-[#c3e832] text-[#11111a] font-sans text-xs font-bold h-10 px-6 rounded-xl gap-2 shadow-md shadow-[#d4f842]/20 transition-all active:scale-95"
            >
              Configure Optimization <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: CONFIGURE & RUN */}
      {/* ========================================================================= */}
      {currentStep === 2 && (
        <div className="space-y-6">
          {/* Machine Selection Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Factory className="h-4 w-4 text-sky-500" /> 1. Machine Selection (Rule B — Dynamic Bounds)
              </h2>
              <span className="text-[11px] font-mono text-slate-400">
                Selected GSMs: {selectedDistinctGsms.join(", ")} GSM
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {machines.map((m) => {
                const isGsmEligible = selectedDistinctGsms.every(
                  (gsm) => gsm >= m.minGsm && gsm <= m.maxGsm
                );
                const isChecked = selectedMachineIds.includes(m.id);

                return (
                  <div
                    key={m.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      !isGsmEligible
                        ? "bg-slate-50 opacity-50 border-slate-200 cursor-not-allowed"
                        : isChecked
                        ? "bg-sky-50/40 border-sky-400 shadow-sm"
                        : "bg-white border-slate-100 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isChecked}
                        disabled={!isGsmEligible}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedMachineIds((prev) => [...prev, m.id]);
                          } else {
                            setSelectedMachineIds((prev) => prev.filter((id) => id !== m.id));
                          }
                        }}
                        id={`mach-${m.id}`}
                        className="rounded-md mt-0.5"
                      />
                      <div className="space-y-1 text-xs">
                        <label
                          htmlFor={`mach-${m.id}`}
                          className="font-bold text-sm text-slate-900 cursor-pointer block"
                        >
                          {m.name} ({m.code})
                        </label>
                        <div className="font-mono text-slate-600">
                          Deckle: <strong>{formatWidthInch(m.maxDeckleInch)}</strong> (Min: {m.minDeckleInch}&quot;)
                        </div>
                        <div className="font-mono text-slate-500 text-[11px]">
                          Trim: {m.minTrimInch}&quot; – {m.maxTrimInch}&quot;
                          {m.trimMode === "ONE_SIDE"
                            ? " (one side)"
                            : ` (${(m.minTrimInch / 2).toFixed(2).replace(/\.?0+$/, "")}" each side)`}{" "}
                          • {m.minGsm}–{m.maxGsm} GSM
                        </div>
                        {!isGsmEligible && (
                          <span className="text-[10px] text-rose-600 font-semibold block pt-1">
                            Cannot run {selectedDistinctGsms.filter((g) => g < m.minGsm || g > m.maxGsm).join(", ")} GSM
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Optimization Objective Selection Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Cpu className="h-4 w-4 text-purple-500" /> 2. Optimization Goal & Solver Objective
              </h2>
            </div>

            <RadioGroup
              value={objective}
              onValueChange={(v: any) => setObjective(v)}
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              <div
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  objective === "MIN_TRIM"
                    ? "bg-emerald-50/50 border-emerald-500 shadow-sm"
                    : "bg-white border-slate-100 hover:border-slate-200"
                }`}
                onClick={() => setObjective("MIN_TRIM")}
              >
                <div className="flex items-start gap-2.5">
                  <RadioGroupItem value="MIN_TRIM" id="obj-min-trim" className="mt-0.5" />
                  <div>
                    <Label htmlFor="obj-min-trim" className="font-bold text-sm text-slate-900 cursor-pointer">
                      Minimise Trim Waste
                    </Label>
                    <p className="text-xs text-slate-500 mt-1">
                      Primary financial focus. Minimises edge trim loss aggressively to maximize paper yield.
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  objective === "MIN_PATTERNS"
                    ? "bg-blue-50/50 border-blue-500 shadow-sm"
                    : "bg-white border-slate-100 hover:border-slate-200"
                }`}
                onClick={() => setObjective("MIN_PATTERNS")}
              >
                <div className="flex items-start gap-2.5">
                  <RadioGroupItem value="MIN_PATTERNS" id="obj-min-patterns" className="mt-0.5" />
                  <div>
                    <Label htmlFor="obj-min-patterns" className="font-bold text-sm text-slate-900 cursor-pointer">
                      Minimise Pattern Changes
                    </Label>
                    <p className="text-xs text-slate-500 mt-1">
                      Reduces slitter knife adjustment downtime by keeping the total distinct patterns low.
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  objective === "BALANCED"
                    ? "bg-purple-50/50 border-purple-500 shadow-sm"
                    : "bg-white border-slate-100 hover:border-slate-200"
                }`}
                onClick={() => setObjective("BALANCED")}
              >
                <div className="flex items-start gap-2.5">
                  <RadioGroupItem value="BALANCED" id="obj-balanced" className="mt-0.5" />
                  <div>
                    <Label htmlFor="obj-balanced" className="font-bold text-sm text-slate-900 cursor-pointer">
                      Balanced Optimization
                    </Label>
                    <p className="text-xs text-slate-500 mt-1">
                      Weighted compromise between trim yield and production changeover efficiency.
                    </p>
                  </div>
                </div>
              </div>
            </RadioGroup>
            
            {/* Zero-Waste Preset Feature */}
            <div className="pt-3 border-t border-slate-100 flex items-center gap-3">
              <Checkbox
                id="stock-presets-toggle"
                checked={useStockPresets}
                onCheckedChange={(checked) => setUseStockPresets(!!checked)}
                className="rounded-md"
              />
              <div>
                <label htmlFor="stock-presets-toggle" className="font-bold text-sm text-slate-900 cursor-pointer">
                  Fill Trim with Stock Presets (Zero Waste Mode)
                </label>
                <p className="text-xs text-slate-500 mt-0.5">
                  Opportunistically insert standard Master Stock sizes into empty deckle gaps. Creates inventory to minimize scrap.
                </p>
              </div>
            </div>

            {/* Collapsible Advanced Parameters */}
            <div className="pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAdvanced((prev) => !prev)}
                className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1.5"
              >
                {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {showAdvanced ? "Hide Advanced Solver Options" : "Show Advanced Solver Options"}
              </button>

              {showAdvanced && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-3 p-4 bg-slate-50/70 rounded-2xl border border-slate-100 text-xs">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Max Patterns / Run</label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      className="h-9 text-xs font-mono rounded-xl bg-white border-slate-200"
                      value={maxPatternsPerRun}
                      onChange={(e) => setMaxPatternsPerRun(parseInt(e.target.value, 10) || 20)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Max Widths / Pattern</label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      className="h-9 text-xs font-mono rounded-xl bg-white border-slate-200"
                      value={maxDistinctWidths}
                      onChange={(e) => setMaxDistinctWidths(parseInt(e.target.value, 10) || 6)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Time Limit (Sec)</label>
                    <Input
                      type="number"
                      min={5}
                      max={120}
                      className="h-9 text-xs font-mono rounded-xl bg-white border-slate-200"
                      value={timeLimitSeconds}
                      onChange={(e) => setTimeLimitSeconds(parseInt(e.target.value, 10) || 30)}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Checkbox
                      id="overprod-toggle"
                      checked={allowOverproduction}
                      onCheckedChange={(checked) => setAllowOverproduction(!!checked)}
                      className="rounded-md"
                    />
                    <label htmlFor="overprod-toggle" className="font-bold text-slate-700 cursor-pointer">
                      Allow Overproduction
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentStep(1)}
              className="h-10 px-5 rounded-xl text-xs font-bold"
            >
              Back to Demand Selection
            </Button>

            <Button
              size="lg"
              disabled={isSolving || selectedMachineIds.length === 0}
              onClick={() => handleRunOptimization()}
              className="h-11 px-8 rounded-xl bg-[#161622] hover:bg-[#202030] text-white font-bold text-xs gap-2 shadow-sm transition-all"
            >
              {isSolving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Optimizing cutting patterns ({solveElapsedSeconds}s)...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current stroke-[2.5]" /> Run Deckle Optimization
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: RESULTS & PATTERN VISUALIZER */}
      {/* ========================================================================= */}
      {currentStep === 3 && solverResult && (
        <div className="space-y-5">
          {/* Inventory used instead of production */}
          {inventoryAllocs.length > 0 && (
            <div
              className={`rounded-2xl p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                inventoryApproved
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-amber-50 border-amber-300"
              }`}
            >
              <div className="text-xs">
                <div
                  className={`font-bold ${inventoryApproved ? "text-emerald-900" : "text-amber-900"}`}
                >
                  {inventoryApproved ? "Inventory allocation approved" : "Inventory reels need your approval"}
                </div>
                <div className="text-slate-600 mt-0.5">
                  {inventoryAllocs.length} free reel{inventoryAllocs.length === 1 ? "" : "s"} (
                  {formatWeightKg(inventoryAllocs.reduce((s, a) => s + a.quantityKg, 0))}) will be
                  allocated to{" "}
                  {new Set(inventoryAllocs.map((a) => a.orderNumber)).size} order(s) instead of being
                  produced.
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setInventoryDialogOpen(true)}
                className="rounded-xl text-xs"
              >
                Review reels
              </Button>
            </div>
          )}

          {/* Compact KPI Strip — single row */}
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Trim Loss</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black font-mono text-slate-900">
                    {solverResult.summary.total_trim_percent.toFixed(2)}%
                  </span>
                </div>
                {heroTrimBenchmark && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${heroTrimBenchmark.badgeClass}`}>
                    {solverResult.summary.total_trim_percent < 3.0 ? "✓ Optimal" : solverResult.summary.total_trim_percent <= 6.0 ? "Acceptable" : "High"}
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Output</span>
                <div className="text-2xl font-black font-mono text-slate-900">
                  {(solverResult.summary.total_kg / 1000).toFixed(2)}
                  <span className="text-sm font-semibold text-slate-400 font-sans ml-1">MT</span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">{solverResult.summary.total_kg.toLocaleString("en-IN")} kg</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Runs</span>
                <div className="text-2xl font-black font-mono text-slate-900">
                  {solverResult.summary.runs_created}
                </div>
                <span className="text-[11px] text-slate-400">1 GSM per run</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Patterns</span>
                <div className="text-2xl font-black font-mono text-slate-900">
                  {solverResult.runs.reduce((acc, r) => acc + r.patterns.length, 0)}
                </div>
                <span className="text-[11px] text-slate-400">Knife setups</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Solver</span>
                <div className="text-2xl font-black font-mono text-slate-900">
                  {(solverResult.summary.solve_time_ms / 1000).toFixed(2)}s
                </div>
                <span className="text-[11px] text-slate-400">Column-generation LP</span>
              </div>
            </div>
          </div>

          {/* Unassigned Items */}
          {solverResult.unassigned_items.length > 0 && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
              <strong className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                {solverResult.unassigned_items.length} Item(s) Not Satisfied
              </strong>
              {solverResult.unassigned_items.map((u, idx) => (
                <div key={idx} className="font-mono text-[11px]">
                  • {u.order_number || u.order_item_id} ({u.width_inch}&quot;, {u.gsm} GSM): {u.reason}
                </div>
              ))}
            </div>
          )}

          {/* AI Trim Advisor — manual-only ways to cut trim further */}
          <TrimAdvisorBanner
            solverResult={solverResult}
            demandItems={demandItems}
            selectedItemIds={selectedItemIds}
            machines={machines}
            onEditPattern={handleEditPatternFromAdvisor}
          />

          {/* Production Runs */}
          <div className="space-y-5">
            {solverResult.runs.map((run, runIndex) => {
              const machine = machines.find((m) => m.id === run.machine_id) || machines[0];
              const aiExplanation = aiExplanations[runIndex];
              const isAiLoading = !!isGeneratingAi[runIndex];

              // Gather distinct widths used across all patterns for summary
              const widthSummary = new Map<number, number>();
              run.patterns.forEach((pat) => {
                pat.cuts.forEach((c) => {
                  widthSummary.set(c.width_inch, (widthSummary.get(c.width_inch) || 0) + c.count * pat.repetitions);
                });
              });
              const sortedWidths = Array.from(widthSummary.entries()).sort((a, b) => b[0] - a[0]);

              return (
                <div
                  key={runIndex}
                  className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] overflow-hidden"
                >
                  {/* Run Header — Compact horizontal bar */}
                  <div className="p-4 bg-slate-900 text-white flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center shrink-0">
                        <Factory className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white truncate">
                          Run #{runIndex + 1} — {machine.name}
                          <span className="text-slate-400 font-normal ml-1">({machine.maxDeckleInch}&quot; deckle)</span>
                        </h3>
                        <div className="flex items-center gap-3 text-xs text-slate-300 mt-0.5">
                          <span className="bg-amber-400 text-slate-950 font-mono font-bold text-[10px] px-1.5 py-0 rounded">
                            {run.gsm} GSM
                          </span>
                          <span>{(run.total_planned_kg / 1000).toFixed(3)} MT</span>
                          <span>•</span>
                          <span>{run.patterns.length} patterns</span>
                          <span>•</span>
                          <span className="text-amber-300 font-mono font-bold">{run.total_trim_percent.toFixed(2)}% trim</span>
                        </div>
                      </div>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => handleGenerateAiExplanation(runIndex)}
                      disabled={isAiLoading}
                      className="h-8 text-xs font-bold rounded-xl gap-1.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 shrink-0"
                    >
                      {isAiLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                      )}
                      {aiExplanation ? "Refresh" : "AI Analysis"}
                    </Button>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Width Breakdown Summary — compact chips row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Widths used:</span>
                      {sortedWidths.map(([width, totalCount]) => (
                        <span
                          key={width}
                          className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 text-xs font-mono"
                        >
                          <span className="font-bold text-slate-900">{formatWidthInch(width)}</span>
                          <span className="text-slate-400">×{totalCount}</span>
                        </span>
                      ))}
                    </div>

                    {/* AI Analysis — structured 3-card layout */}
                    {aiExplanation && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50/30 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                            AI Plan Analysis
                          </div>
                          <span className="text-[10px] text-amber-500 italic">
                            Numbers from the solver • explanations from AI
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="p-3 rounded-xl bg-white border border-amber-100 text-xs space-y-1">
                            <strong className="text-[10px] uppercase text-amber-700 tracking-wide">Summary</strong>
                            <p className="text-slate-700 leading-relaxed">{aiExplanation.summary}</p>
                          </div>
                          <div className="p-3 rounded-xl bg-white border border-amber-100 text-xs space-y-1">
                            <strong className="text-[10px] uppercase text-amber-700 tracking-wide">Waste Tradeoffs</strong>
                            <p className="text-slate-700 leading-relaxed">{aiExplanation.tradeoffs}</p>
                          </div>
                          {aiExplanation.suggestions && aiExplanation.suggestions.length > 0 && (
                            <div className="p-3 rounded-xl bg-white border border-amber-100 text-xs space-y-1">
                              <strong className="text-[10px] uppercase text-amber-700 tracking-wide">Suggestions</strong>
                              <ul className="space-y-1 text-slate-700">
                                {aiExplanation.suggestions.map((sug, sIdx) => (
                                  <li key={sIdx} className="flex items-start gap-1">
                                    <span className="text-amber-600 mt-0.5">→</span>
                                    <span>{sug.action} <span className="font-semibold text-emerald-700">({sug.impact})</span></span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Pattern List — each pattern is a clean row */}
                    <div className="space-y-3">
                      {run.patterns.map((pat, patIndex) => {
                        const cutsDisplay = pat.cuts.map((c) => {
                          const it = demandItems.find((d) => d.id === c.order_item_id);
                          const isStockPreset = !it || it.orderNumber === "STOCK" || (c as any).order_number === "STOCK";
                          return {
                            orderItemId: c.order_item_id,
                            orderNumber: it?.orderNumber || (isStockPreset ? "STOCK" : "DIRECT CUT"),
                            clientName: it?.clientName,
                            widthInch: c.width_inch,
                            count: c.count,
                            isStockPreset,
                          };
                        });

                        return (
                          <div
                            key={patIndex}
                            className="relative group p-4 rounded-2xl bg-slate-50/50 border border-slate-100 hover:border-slate-200 transition-all"
                          >
                            <PatternBar
                              deckleInch={machine.maxDeckleInch}
                              usedWidthInch={pat.used_width_inch}
                              trimWidthInch={pat.trim_width_inch}
                              trimPercent={pat.trim_percent}
                              repetitions={pat.repetitions}
                              estimatedKg={pat.estimated_kg}
                              sequence={pat.sequence}
                              cuts={cutsDisplay}
                              isManuallyEdited={pat.is_manually_edited}
                              orderColorMap={orderColorMap}
                              trimMode={machine.trimMode}
                            />

                            {/* Edit Override Button */}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setActiveOverrideTarget({
                                  runIndex,
                                  patternIndex: patIndex,
                                  pattern: pat,
                                });
                                setOverrideModalOpen(true);
                              }}
                              className="absolute top-3 right-3 h-7 text-xs font-bold rounded-lg gap-1 bg-white hover:bg-slate-100 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Row & Commit Button */}
          <div className="sticky bottom-4 z-10 p-4 bg-slate-900 text-white rounded-2xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep(2)}
                className="text-xs bg-slate-800 border-slate-700 text-white hover:bg-slate-700 rounded-xl"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Re-configure
              </Button>
              <div className="text-slate-400 font-sans text-xs">
                Review patterns above, then commit to release to machine floor.
              </div>
            </div>

            <Button
              size="lg"
              disabled={
                isCommitting ||
                (solverResult.runs.length === 0 && inventoryAllocs.length === 0)
              }
              onClick={handleCommitRuns}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs px-8 h-10 rounded-xl gap-2 shadow-lg transition-all"
            >
              {isCommitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Committing...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 stroke-[2.5]" />{" "}
                  {solverResult.runs.length === 0
                    ? "Confirm Inventory Allocation"
                    : "Commit Production Runs"}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Inventory reels used instead of production: approve or re-run without */}
      <InventoryUsageDialog
        open={inventoryDialogOpen}
        onOpenChange={setInventoryDialogOpen}
        allocations={inventoryAllocs}
        isBusy={isSolving}
        onApprove={() => {
          setInventoryApproved(true);
          setInventoryDialogOpen(false);
          toast.success("Inventory allocation approved.");
        }}
        onRerun={(excludedIds) => {
          setInventoryDialogOpen(false);
          handleRunOptimization(excludedIds);
        }}
      />

      {/* Manual Pattern Override Modal */}
      {activeOverrideTarget && solverResult && (
        <PatternOverrideDialog
          open={overrideModalOpen}
          onOpenChange={setOverrideModalOpen}
          pattern={activeOverrideTarget.pattern}
          machine={
            machines.find(
              (m) => m.id === solverResult.runs[activeOverrideTarget.runIndex].machine_id
            ) || machines[0]
          }
          gsm={solverResult.runs[activeOverrideTarget.runIndex].gsm}
          availableItems={demandItems.map((d) => ({
            id: d.id,
            orderNumber: d.orderNumber,
            widthInch: d.widthInch,
          }))}
          onSave={handleSavePatternOverride}
        />
      )}
    </div>
  );
}
