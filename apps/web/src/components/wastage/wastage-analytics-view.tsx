"use client";

import * as React from "react";
import Link from "next/link";
import { formatWeightKg, formatTrimPercent } from "@/lib/utils";
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
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  TrendingDown,
  Factory,
  Layers,
  PieChart as PieIcon,
  AlertTriangle,
  ExternalLink,
  Scissors,
  CheckCircle2,
  Info,
  Sparkles,
} from "lucide-react";

interface WastageAnalyticsData {
  trendData: Array<{
    date: string;
    avgTrimPercent: number;
    runsCount: number;
    plannedKg: number;
  }>;
  machineComparison: Array<{
    machineName: string;
    avgTrimPercent: number;
    runsCount: number;
    totalKg: number;
  }>;
  gsmComparison: Array<{
    gsm: string;
    avgTrimPercent: number;
    runsCount: number;
    totalKg: number;
  }>;
  typeBreakdown: Array<{
    type: string;
    value: number;
  }>;
  worstRuns: Array<{
    id: string;
    runNumber: string;
    machineName: string;
    gsm: number;
    trimPercent: number;
    totalPlannedKg: number;
    date: string;
  }>;
  theoreticalTrimKg: number;
  operatorWastageKg: number;
  varianceKg: number;
  variancePct: number;
}

interface WastageAnalyticsViewProps {
  analytics: WastageAnalyticsData;
}

const DONUT_COLORS = ["#38bdf8", "#f59e0b", "#f43f5e", "#a855f7"];

export function WastageAnalyticsView({ analytics }: WastageAnalyticsViewProps) {
  const isHighVariance = Math.abs(analytics.variancePct) > 15.0;

  return (
    <div className="space-y-6 font-sans pb-10">
      {/* 1. TOP HERO BANNER */}
      <div className="bg-white rounded-[26px] p-6 sm:p-7 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-[11px] font-bold uppercase tracking-wide">
            QUALITY & EFFICIENCY • WASTAGE MONITORING
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <TrendingDown className="h-7 w-7 text-rose-500" />
            Trim & Scrap Wastage Analytics
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl font-medium">
            Analyze theoretical deckle optimizer trim vs operator floor scrap logs, root causes, and machine scrap benchmarks.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button asChild className="h-10 px-5 rounded-full bg-[#161622] hover:bg-[#202030] text-[#d4f842] font-bold text-xs gap-1.5 shadow-md transition-all">
            <Link href="/deckle">
              <Scissors className="h-4 w-4 stroke-[2.5]" /> Run Deckle Optimizer
            </Link>
          </Button>
        </div>
      </div>

      {/* 2. 4 PERFORMANCE KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* 1. THEORETICAL TRIM (Hero Dark Card) */}
        <div className="relative overflow-hidden rounded-[26px] bg-[#161622] text-white p-6 shadow-xl flex flex-col justify-between min-h-[160px]">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#d4f842]/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">
              Theoretical Trim
            </span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#d4f842] text-black text-[11px] font-bold shadow-sm">
              <span>Loss</span>
              <Scissors className="h-3 w-3" />
            </div>
          </div>
          <div className="space-y-1 mt-3">
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight">
              {(analytics.theoreticalTrimKg / 1000).toFixed(2)}{" "}
              <span className="text-sm font-semibold text-slate-400 font-sans">MT</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Planned edge trim loss across batches
            </p>
          </div>
        </div>

        {/* 2. OPERATOR LOGGED SCRAP */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Logged Scrap
            </span>
            <div className="h-8 w-8 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="space-y-1 mt-3">
            <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 tracking-tight">
              {(analytics.operatorWastageKg / 1000).toFixed(2)}{" "}
              <span className="text-sm font-semibold text-slate-400 font-sans">MT</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Floor weighbridge scrap logs
            </p>
          </div>
        </div>

        {/* 3. SCRAP VARIANCE */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Scrap Variance
            </span>
            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${isHighVariance ? "bg-rose-50 text-rose-500" : "bg-emerald-50 text-emerald-600"}`}>
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
          <div className="space-y-1 mt-3">
            <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 tracking-tight">
              {analytics.variancePct > 0 ? `+${analytics.variancePct.toFixed(1)}%` : `${analytics.variancePct.toFixed(1)}%`}
            </div>
            <p className={`text-[11px] font-bold ${isHighVariance ? "text-rose-600" : "text-emerald-700"}`}>
              {isHighVariance ? "High floor deviation" : "✓ Within acceptable limits"}
            </p>
          </div>
        </div>

        {/* 4. NET VARIANCE */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Net Variance
            </span>
            <div className="h-8 w-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="space-y-1 mt-3">
            <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 tracking-tight">
              {formatWeightKg(Math.abs(analytics.varianceKg))}
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Reconciled theoretical difference
            </p>
          </div>
        </div>
      </div>

      {/* 3. CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Trim % Trend */}
        <div className="bg-white rounded-[26px] p-6 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-sky-500" /> Daily Trim % Trend (30 Days)
              </h2>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                Deckle trim loss daily average against target threshold.
              </p>
            </div>
          </div>

          <div className="h-[260px]">
            {analytics.trendData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No production run data available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis unit="%" domain={[0, "auto"]} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(val: any) => [`${val}%`, "Trim %"]} />
                  <Line
                    type="monotone"
                    dataKey="avgTrimPercent"
                    stroke="#0284c7"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Machine Breakdown */}
        <div className="bg-white rounded-[26px] p-6 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Factory className="h-4 w-4 text-sky-500" /> Trim Performance by Machine
              </h2>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                Average deckle trim loss across paper machines.
              </p>
            </div>
          </div>

          <div className="h-[260px]">
            {analytics.machineComparison.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No machine comparison data available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.machineComparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                  <XAxis dataKey="machineName" tick={{ fontSize: 11 }} />
                  <YAxis unit="%" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(val: any) => [`${val}%`, "Avg Trim"]} />
                  <Bar dataKey="avgTrimPercent" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* 4. HIGHEST TRIM RUNS TABLE */}
      <div className="bg-white rounded-[26px] border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Runs with Highest Trim Loss
            </h2>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              Production runs exceeding the standard 3.0% trim waste threshold.
            </p>
          </div>
        </div>

        <Table>
          <TableHeader className="bg-slate-50/70">
            <TableRow>
              <TableHead className="text-[11px] font-bold uppercase text-slate-500">Run Number</TableHead>
              <TableHead className="text-[11px] font-bold uppercase text-slate-500">Machine</TableHead>
              <TableHead className="text-[11px] font-bold uppercase text-slate-500">Quality</TableHead>
              <TableHead className="text-right text-[11px] font-bold uppercase text-slate-500">Planned Output</TableHead>
              <TableHead className="text-right text-[11px] font-bold uppercase text-slate-500">Trim Loss</TableHead>
              <TableHead className="text-right text-[11px] font-bold uppercase text-slate-500">Date</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {analytics.worstRuns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-xs text-slate-400">
                  No high-trim production runs detected. All runs within optimal tolerances!
                </TableCell>
              </TableRow>
            ) : (
              analytics.worstRuns.map((r) => (
                <TableRow key={r.id} className="hover:bg-slate-50/50 text-xs">
                  <TableCell className="font-mono font-bold text-sky-600">
                    <Link href={`/production/${r.id}`} className="hover:underline">
                      {r.runNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-800 font-medium">{r.machineName}</TableCell>
                  <TableCell>
                    <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-mono font-bold text-[10px]">
                      {r.gsm} GSM
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-slate-900 font-bold">
                    {formatWeightKg(r.totalPlannedKg)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-rose-600">
                    {r.trimPercent.toFixed(2)}%
                  </TableCell>
                  <TableCell className="text-right font-mono text-slate-500 text-[11px]">
                    {r.date}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm" className="h-7 text-[11px] text-sky-600 hover:text-sky-700">
                      <Link href={`/production/${r.id}`}>Inspect</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
