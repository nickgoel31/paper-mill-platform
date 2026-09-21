"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RunStatus, Role } from "@/generated/prisma/browser";
import { formatWeightKg, formatTrimPercent, formatWidthInch } from "@/lib/utils";
import {
  releaseRunToFloor,
  cancelProductionRun,
} from "@/server/services/production-service";
import dynamic from "next/dynamic";
import { PatternBar } from "@/components/deckle/pattern-bar";

// jsPDF (~350 KB) stays out of the server bundle: client-only, no SSR.
const RunCardPdfButton = dynamic(() => import("./run-card-pdf-button"), {
  ssr: false,
  loading: () => (
    <Button variant="outline" size="sm" disabled className="gap-1.5 text-xs font-bold">
      Download Run Card (A4 PDF)
    </Button>
  ),
});
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Factory,
  Play,
  CheckCircle2,
  XCircle,
  Printer,
  Sparkles,
  History,
  Scissors,
  Layers,
  Calendar,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Download,
} from "lucide-react";

interface RunDetailViewProps {
  run: any;
  userRole: Role;
}

export function RunDetailView({ run, userRole }: RunDetailViewProps) {
  const router = useRouter();
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  const [cancelModalOpen, setCancelModalOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");

  const canManage = userRole === Role.ADMIN || userRole === Role.PLANNER;

  const totalPlannedKg = Number(run.totalPlannedKg) || 0;
  const actualKg = Number(run.totalActualKg) || 0;
  const trimPct = Number(run.totalTrimPercent) || 0;
  const trimBenchmark = formatTrimPercent(trimPct);

  const handleRelease = async () => {
    setIsTransitioning(true);
    try {
      await releaseRunToFloor(run.id);
      toast.success(`Production Run #${run.runNumber} released to the floor.`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to release run");
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleConfirmCancel = async () => {
    setIsTransitioning(true);
    try {
      await cancelProductionRun(run.id, cancelReason);
      toast.success(`Production Run #${run.runNumber} cancelled. Orders reverted to CONFIRMED.`);
      setCancelModalOpen(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel run");
    } finally {
      setIsTransitioning(false);
    }
  };


  // Order colors mapping
  const orderColorMap = React.useMemo(() => {
    const colors = [
      "bg-blue-600 border-blue-700 text-white",
      "bg-emerald-600 border-emerald-700 text-white",
      "bg-violet-600 border-violet-700 text-white",
      "bg-amber-600 border-amber-700 text-white",
      "bg-sky-600 border-sky-700 text-white",
      "bg-rose-600 border-rose-700 text-white",
    ];
    const map: Record<string, string> = {};
    (run.orderItems || []).forEach((it: any, idx: number) => {
      if (it.order?.orderNumber) {
        map[it.order.orderNumber] = colors[idx % colors.length];
      }
    });
    return map;
  }, [run.orderItems]);

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header & Status Bar (Hidden in Print View) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 bg-white p-6 sm:p-7 rounded-[26px] border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] print:hidden">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs px-2 text-slate-500 hover:text-slate-900 rounded-lg">
              <Link href="/production">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Production
              </Link>
            </Button>
            <span className="text-slate-300">•</span>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[10px] font-mono font-bold uppercase">
              RUN #{run.runNumber}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black font-mono text-slate-900 tracking-tight">
              {run.runNumber}
            </h1>
            <Badge
              className={`font-mono text-xs ${
                run.status === RunStatus.RELEASED
                  ? "bg-blue-100 text-blue-800 border-blue-300"
                  : run.status === RunStatus.RUNNING
                  ? "bg-amber-100 text-amber-800 border-amber-300 animate-pulse"
                  : run.status === RunStatus.COMPLETED
                  ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                  : run.status === RunStatus.CANCELLED
                  ? "bg-red-100 text-red-800 border-red-300"
                  : ""
              }`}
            >
              {run.status}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs font-bold text-sky-600 bg-sky-50 border-sky-200">
              {run.gsm} GSM
            </Badge>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Machine: <strong className="text-slate-900">{run.machine.name}</strong> ({Number(run.machine.maxDeckleInch).toFixed(1)}&quot; Deckle) • Scheduled: {new Date(run.createdAt).toLocaleString("en-IN")}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <RunCardPdfButton run={run} />

          {run.status === RunStatus.PLANNED && canManage && (
            <Button
              size="sm"
              disabled={isTransitioning}
              onClick={handleRelease}
              className="h-10 px-5 rounded-xl bg-[#161622] hover:bg-[#202030] text-white font-bold text-xs shadow-sm gap-1.5 transition-all"
            >
              {isTransitioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Release to Floor
            </Button>
          )}

          {run.status !== RunStatus.COMPLETED &&
            run.status !== RunStatus.CANCELLED &&
            canManage && (
              <Button
                variant="outline"
                size="sm"
                disabled={isTransitioning}
                onClick={() => setCancelModalOpen(true)}
                className="h-10 px-4 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold shadow-xs gap-1.5"
              >
                <XCircle className="h-4 w-4" /> Cancel Run
              </Button>
            )}
        </div>
      </div>

      {/* Printable Run Card Header (Visible in Print View) */}
      <div className="hidden print:block border-b-2 border-slate-900 pb-3">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold font-mono">PAPERMILL ERP — PRODUCTION RUN CARD</h1>
            <div className="text-sm font-mono mt-1">
              RUN: <strong>{run.runNumber}</strong> | MACHINE: <strong>{run.machine.name} ({run.machine.maxDeckleInch}&quot;)</strong>
            </div>
          </div>
          <div className="text-right text-xs font-mono">
            <div>GSM: <strong>{run.gsm} GSM</strong></div>
            <div>STATUS: <strong>{run.status}</strong></div>
            <div>DATE: {new Date().toLocaleDateString("en-IN")}</div>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 print:grid-cols-4">
        {/* Card 1: Planned Output (Hero Dark Card) */}
        <div className="relative overflow-hidden rounded-[26px] bg-[#161622] text-white p-6 shadow-xl flex flex-col justify-between min-h-[160px]">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#d4f842]/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Planned Output</span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#d4f842] text-black text-[11px] font-bold shadow-sm">
              <span>Target</span>
              <Factory className="h-3 w-3" />
            </div>
          </div>
          <div className="space-y-1 mt-3">
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight">
              {(totalPlannedKg / 1000).toFixed(2)}{" "}
              <span className="text-sm font-semibold text-slate-400 font-sans">MT</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              {totalPlannedKg.toLocaleString("en-IN")} kg scheduled
            </p>
          </div>
        </div>

        {/* Card 2: Trim Wastage */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Trim Wastage</span>
            <div className="h-8 w-8 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center">
              <Scissors className="h-4 w-4" />
            </div>
          </div>
          <div className="space-y-1 mt-3">
            <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 tracking-tight">
              {trimPct.toFixed(2)}%
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold inline-block ${trimBenchmark.badgeClass}`}>
              {trimBenchmark.text} Trim
            </span>
          </div>
        </div>

        {/* Card 3: Actual Output */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Actual Output</span>
            <div className="h-8 w-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="space-y-1 mt-3">
            <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-700 tracking-tight">
              {actualKg > 0 ? `${(actualKg / 1000).toFixed(2)} MT` : "—"}
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              {actualKg > 0 ? `${actualKg.toLocaleString("en-IN")} kg produced` : "Pending floor weighing"}
            </p>
          </div>
        </div>

        {/* Card 4: Slitter Setups */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Cutting Setups</span>
            <div className="h-8 w-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="space-y-1 mt-3">
            <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 tracking-tight">
              {run.patterns.length}
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Distinct knife patterns
            </p>
          </div>
        </div>
      </div>

      {/* Cutting Pattern Bars Visualizer Section */}
      <Card className="rounded-[26px] border border-slate-100 bg-white shadow-sm overflow-hidden print:border print:shadow-none">
        <CardHeader className="p-5 border-b border-slate-100 bg-slate-50/50 print:bg-white flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Scissors className="h-5 w-5 text-primary" />
              Machine Cutting Patterns ({run.patterns.length})
            </CardTitle>
            <CardDescription className="text-xs">
              Slitter knife positioning and blade sequences across the {Number(run.machine.maxDeckleInch).toFixed(1)}&quot; web.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {run.patterns.map((pat: any, idx: number) => {
            const cutsDisplay = pat.cuts.map((c: any) => {
              const item = (run.orderItems || []).find((it: any) => it.id === c.orderItemId);
              const isStockPreset = !item && (!!c.stockPresetId || !c.orderItemId);
              return {
                orderItemId: c.orderItemId || c.stockPresetId || "stock",
                orderNumber: item?.order?.orderNumber || (isStockPreset ? "STOCK" : "DIRECT CUT"),
                clientName: item?.order?.client?.name || c.stockPreset?.name,
                widthInch: Number(c.widthInch),
                count: c.count,
                isStockPreset,
              };
            });

            return (
              <div key={pat.id} className="space-y-2">
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
                  orderColorMap={orderColorMap}
                  trimMode={(run.machine as any).trimMode}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {(run as any).operatorFeedback && (
        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Operator feedback
            </div>
            <p className="text-sm text-slate-800 whitespace-pre-wrap">
              {(run as any).operatorFeedback}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Order Impact Table */}
      <Card className="print:border print:shadow-none">
        <CardHeader className="pb-3 border-b bg-slate-50/50 print:bg-white">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Customer Orders Served by this Production Run ({run.orderItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-100/70 text-[11px]">
                <TableHead className="w-[50px] text-center">#</TableHead>
                <TableHead>Order No.</TableHead>
                <TableHead>Client & City</TableHead>
                <TableHead className="text-right">Reel Width</TableHead>
                <TableHead className="text-right">Ordered Qty</TableHead>
                <TableHead className="text-right">Target Tolerance</TableHead>
                <TableHead className="text-right">Produced Qty</TableHead>
                <TableHead>Delivery Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.orderItems.map((it: any, index: number) => {
                const isFulfilled = Number(it.producedKg || 0) >= Number(it.quantityKg) * 0.95;

                return (
                  <TableRow key={it.id} className="text-xs">
                    <TableCell className="text-center font-mono text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/orders/${it.order.id}`}
                        className="font-mono font-bold text-primary hover:underline flex items-center gap-1"
                      >
                        {it.order.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-slate-900">{it.order.client.name}</div>
                      <div className="text-[11px] font-mono text-muted-foreground">
                        {it.order.client.city}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {formatWidthInch(it.widthInch)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {formatWeightKg(it.quantityKg)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      ±{Number(it.tolerancePercent).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      <span className={isFulfilled ? "text-emerald-700" : "text-slate-700"}>
                        {formatWeightKg(it.producedKg || 0)}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {it.order.deliveryDate
                        ? new Date(it.order.deliveryDate).toLocaleDateString("en-IN")
                        : "Open"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cancel Dialog */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle className="text-base font-bold">
                Cancel Production Run #{run.runNumber}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Cancelling this run will free all {run.orderItems.length} demand items and revert their
              orders back to CONFIRMED so they can be re-planned.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label className="text-xs font-semibold">Cancellation Reason (Optional)</label>
            <Input
              placeholder="e.g. Machine maintenance shutdown, plan superseded"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isTransitioning}
              onClick={() => setCancelModalOpen(false)}
            >
              Keep Run
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isTransitioning}
              onClick={handleConfirmCancel}
            >
              {isTransitioning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cancelling...
                </>
              ) : (
                "Confirm Cancel Run"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
