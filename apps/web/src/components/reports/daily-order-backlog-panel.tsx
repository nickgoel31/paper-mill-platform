"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  generateDailyOrderReport,
  getDailyOrderReport,
  listDailyOrderReportDates,
} from "@/server/services/daily-order-report-service";
import { CLIENT_TYPE_LABELS } from "@/lib/schemas/client";
import type { DailyOrderReportLine } from "@/lib/pdf/generate-daily-order-report-pdf";

const DailyOrderReportPdfButton = dynamic(() => import("./daily-order-report-pdf-button"), {
  ssr: false,
  loading: () => (
    <Button size="sm" disabled className="h-9 text-xs font-bold gap-1.5">
      Download PDF
    </Button>
  ),
});

const CLIENT_TYPE_ORDER = ["DEALER", "CORRUGATOR", "DIRECT", "RETAIL", "EXPORT"];
const mt = (kg: number) => (kg / 1000).toFixed(3);

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function DailyOrderBacklogPanel({ millName }: { millName: string }) {
  const [date, setDate] = React.useState(todayStr());
  const [availableDates, setAvailableDates] = React.useState<string[]>([]);
  const [lines, setLines] = React.useState<DailyOrderReportLine[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  const loadDates = React.useCallback(async () => {
    try {
      const dates = await listDailyOrderReportDates();
      setAvailableDates(dates);
      return dates;
    } catch (err: any) {
      toast.error(err.message || "Failed to load report dates");
      return [];
    }
  }, []);

  const loadForDate = React.useCallback(async (d: string) => {
    setIsLoading(true);
    try {
      const rows = await getDailyOrderReport(d);
      setLines(rows as DailyOrderReportLine[]);
    } catch (err: any) {
      toast.error(err.message || "Failed to load report");
    } finally {
      setIsLoading(false);
      setLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    (async () => {
      const dates = await loadDates();
      const initial = dates[0] || todayStr();
      setDate(initial);
      await loadForDate(initial);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDateChange = (d: string) => {
    setDate(d);
    loadForDate(d);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await generateDailyOrderReport(date);
      toast.success(`Generated: ${res.rows} client row(s) for ${date}.`);
      await loadDates();
      await loadForDate(date);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate report");
    } finally {
      setIsGenerating(false);
    }
  };

  const grouped = React.useMemo(() => {
    const map = new Map<string, DailyOrderReportLine[]>();
    for (const l of lines) {
      const list = map.get(l.clientType) || [];
      list.push(l);
      map.set(l.clientType, list);
    }
    return Array.from(map.entries()).sort(
      (a, b) =>
        (CLIENT_TYPE_ORDER.indexOf(a[0]) === -1 ? 99 : CLIENT_TYPE_ORDER.indexOf(a[0])) -
        (CLIENT_TYPE_ORDER.indexOf(b[0]) === -1 ? 99 : CLIENT_TYPE_ORDER.indexOf(b[0]))
    );
  }, [lines]);

  return (
    <Card className="rounded-[26px] border-slate-100 shadow-sm">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base font-bold">Daily Order Backlog Report</CardTitle>
          <CardDescription>
            Per-party opening/new/dispatched/closing order backlog by client type, in Metric Tons. Auto-generated
            every day at close of business — or generate/refresh any date on demand.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            max={todayStr()}
            className="h-9 text-xs w-[150px]"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={isGenerating}
            onClick={handleGenerate}
            className="h-9 text-xs font-bold gap-1.5"
          >
            {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Generate / Refresh
          </Button>
          <DailyOrderReportPdfButton reportDate={date} millName={millName} lines={lines} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="text-center text-xs text-slate-400 py-10">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            Loading report...
          </div>
        ) : lines.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-10">
            {loaded
              ? `No snapshot for ${date} yet. Click "Generate / Refresh" to compute it now.`
              : "Loading..."}
          </div>
        ) : (
          grouped.map(([type, rows]) => {
            const totals = rows.reduce(
              (acc, r) => ({
                monthQtyKg: acc.monthQtyKg + r.monthQtyKg,
                openingKg: acc.openingKg + r.openingKg,
                newOrdersKg: acc.newOrdersKg + r.newOrdersKg,
                dispatchedKg: acc.dispatchedKg + r.dispatchedKg,
                closingKg: acc.closingKg + r.closingKg,
                pendingSizesKg: acc.pendingSizesKg + r.pendingSizesKg,
              }),
              { monthQtyKg: 0, openingKg: 0, newOrdersKg: 0, dispatchedKg: 0, closingKg: 0, pendingSizesKg: 0 }
            );
            return (
              <div key={type} className="overflow-x-auto rounded-xl border border-slate-100">
                <div className="px-3 py-2 bg-slate-50 border-b text-xs font-bold text-slate-800">
                  {CLIENT_TYPE_LABELS[type as keyof typeof CLIENT_TYPE_LABELS] || type}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Party Name</TableHead>
                      <TableHead className="text-[10px] text-right">Qty (Month)</TableHead>
                      <TableHead className="text-[10px] text-right">Opening (incl. pending)</TableHead>
                      <TableHead className="text-[10px] text-right">New Orders</TableHead>
                      <TableHead className="text-[10px] text-right">Less Dispatch</TableHead>
                      <TableHead className="text-[10px] text-right">Closing (incl. pending)</TableHead>
                      <TableHead className="text-[10px] text-right">Pending Sizes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.clientId}>
                        <TableCell className="text-xs font-semibold">{r.clientName}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{mt(r.monthQtyKg)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {r.openingKg > 0.005 ? mt(r.openingKg) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {r.newOrdersKg > 0.005 ? mt(r.newOrdersKg) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {r.dispatchedKg > 0.005 ? mt(r.dispatchedKg) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono font-bold">
                          {r.closingKg > 0.005 ? mt(r.closingKg) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {r.pendingSizesKg > 0.005 ? mt(r.pendingSizesKg) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-slate-50 font-bold">
                      <TableCell className="text-xs">TOTAL</TableCell>
                      <TableCell className="text-xs text-right font-mono">{mt(totals.monthQtyKg)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{mt(totals.openingKg)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{mt(totals.newOrdersKg)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{mt(totals.dispatchedKg)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{mt(totals.closingKg)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{mt(totals.pendingSizesKg)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            );
          })
        )}
        {availableDates.length > 0 && (
          <p className="text-[11px] text-slate-400">
            {availableDates.length} snapshot{availableDates.length === 1 ? "" : "s"} available, most recent:{" "}
            {availableDates[0]}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
