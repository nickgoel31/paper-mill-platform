"use client";

import * as React from "react";
import Link from "next/link";
import { formatCurrencyINR } from "@/lib/utils";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  Scissors,
  Factory,
  Package,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  Plus,
  Truck,
  ChevronDown,
  Layers,
  FileText,
  Clock,
  Sparkles,
  Search,
} from "lucide-react";
import { Role } from "@/generated/prisma/browser";

interface ExecutiveDashboardViewProps {
  data: any;
  userRole: Role;
}

export function ExecutiveDashboardView({ data, userRole }: ExecutiveDashboardViewProps) {
  const [timePeriod, setTimePeriod] = React.useState("Last 30 Days");
  const { kpis, charts, actionLists } = data;

  const totalRevenue = Number(kpis.invoicedThisMonth) || 0;
  const totalProductionMT = (Number(kpis.totalProducedKgThisMonth) || 0) / 1000;
  const avgTrim = Number(kpis.avgTrimPercent30d) || 0;
  const pendingMT = (Number(kpis.pendingKg) || 0) / 1000;

  // Modern 5-Step Pipeline Stages styled cleanly with pills
  const pipelineStages = [
    {
      step: 1,
      title: "Sales Orders",
      value: `${kpis.openOrdersCount} Active`,
      sub: `${pendingMT.toFixed(1)} MT Demand`,
      href: "/orders",
      actionText: "Book Order",
      actionHref: "/orders/new",
      dotColor: "bg-sky-500",
    },
    {
      step: 2,
      title: "Deckle Planning",
      value: `${pendingMT.toFixed(1)} MT`,
      sub: `Target: ≤ 3.0% Trim`,
      href: "/deckle",
      actionText: "Optimize",
      actionHref: "/deckle",
      dotColor: "bg-[#d4f842]",
    },
    {
      step: 3,
      title: "Floor Production",
      value: `${totalProductionMT.toFixed(1)} MT`,
      sub: `${actionLists.todayRuns.length} Runs Today`,
      href: "/production",
      actionText: "Floor Terminal",
      actionHref: "/operator",
      dotColor: "bg-amber-500",
    },
    {
      step: 4,
      title: "Load & Dispatch",
      value: `${kpis.dispatchesThisWeek} Dispatched`,
      sub: `${actionLists.todayBatches.length} Trucks Today`,
      href: "/dispatch",
      actionText: "Dispatch Desk",
      actionHref: "/dispatch",
      dotColor: "bg-emerald-500",
    },
    {
      step: 5,
      title: "GST Invoicing",
      value: `₹${(totalRevenue / 100000).toFixed(1)}L`,
      sub: "Tax Reconciled",
      href: "/invoices",
      actionText: "Billing",
      actionHref: "/invoices",
      dotColor: "bg-purple-500",
    },
  ];

  // Map machine production data for striped chart
  const machineBarData = (charts.productionByMachineData ?? []).map((m: any) => ({
    name: m.machine.replace(/Paper Machine\s*/i, "PM "),
    actual: Math.round(m.weightKg / 1000),
    target: Math.round((m.weightKg * 1.12) / 1000),
  }));

  // Map daily trim trend for dual spline area chart
  const trimChartData = (charts.trimTrendData ?? []).map((d: any) => ({
    name: d.date,
    trimLoss: d.avgTrimPercent,
    efficiencyRate: +(100 - d.avgTrimPercent).toFixed(1),
  }));

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* 1. 4 KPI METRIC CARDS ROW (Exact Style of Analytics Page) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: HERO DARK CARD (Revenue & Cashflow) */}
        <div className="relative overflow-hidden rounded-[26px] bg-[#161622] text-white p-6 shadow-xl flex flex-col justify-between min-h-[170px]">
          {/* Subtle lime glow orb */}
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#d4f842]/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-start justify-between relative z-10">
            <div>
              <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">
                Net Billing (Mo)
              </span>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1 font-mono">
                {formatCurrencyINR(totalRevenue)}
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#d4f842] text-black text-[11px] font-bold shadow-sm">
              <span>•••</span>
            </div>
          </div>

          <div className="flex items-center justify-between mt-5 pt-3 border-t border-white/10 relative z-10">
            <div className="flex items-center gap-1 text-xs font-bold text-slate-300">
              <FileText className="w-3.5 h-3.5" />
              <span className="text-[11px] font-normal text-slate-400">
                {new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })} · total invoiced
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: White Pill Card - Total Production */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[170px] hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                Reconciled Output
              </span>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-1">
                {totalProductionMT.toFixed(1)} <span className="text-sm font-semibold text-slate-400">MT</span>
              </div>
            </div>
            <button className="text-slate-400 hover:text-slate-600 p-1">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between mt-5 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1 text-xs font-bold text-slate-500">
              <span className="text-[11px] font-normal">reconciled from floor runs this month</span>
            </div>
            <div className="w-7 h-7 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600">
              <Factory className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Card 3: White Pill Card - Trim Wastage */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[170px] hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                Avg Trim Loss (30D)
              </span>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-1">
                {avgTrim}%
              </div>
            </div>
            <button className="text-slate-400 hover:text-slate-600 p-1">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between mt-5 pt-3 border-t border-slate-100">
            <div
              className={`flex items-center gap-1 text-xs font-bold ${
                avgTrim === 0
                  ? "text-slate-400"
                  : avgTrim <= 3
                    ? "text-emerald-600"
                    : "text-red-600"
              }`}
            >
              {avgTrim === 0 ? (
                <span className="text-[11px] font-normal">no completed runs yet</span>
              ) : (
                <>
                  {avgTrim <= 3 ? (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  )}
                  <span>{avgTrim <= 3 ? "Optimal" : "Above target"}</span>
                  <span className="text-[11px] font-normal text-slate-500 ml-1">(≤ 3.0% threshold)</span>
                </>
              )}
            </div>
            <div className="w-7 h-7 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Scissors className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Card 4: White Pill Card - Open Demand */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[170px] hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                Open Demand Queue
              </span>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-1">
                {pendingMT.toFixed(1)} <span className="text-sm font-semibold text-slate-400">MT</span>
              </div>
            </div>
            <button className="text-slate-400 hover:text-slate-600 p-1">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between mt-5 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1 text-xs font-bold text-slate-700">
              <span>{kpis.openOrdersCount}</span>
              <span className="text-[11px] font-normal text-slate-500 ml-1">orders confirmed</span>
            </div>
            <div className="w-7 h-7 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600">
              <Package className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. 5-STEP MILL PIPELINE FLOW (Horizontal Pill Cards) */}
      <div className="bg-white rounded-[26px] p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">5-Step Mill Production Flow</h2>
            <p className="text-xs text-slate-400 mt-0.5">End-to-end lifecycle from customer order to tax invoice</p>
          </div>
          <Link
            href="/deckle"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#161622] hover:bg-slate-800 text-[#d4f842] text-xs font-bold transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>New Deckle Run</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 pt-1">
          {pipelineStages.map((stage) => (
            <div
              key={stage.step}
              className="p-4 rounded-2xl bg-[#F7F7F5] border border-slate-200/60 hover:border-slate-300 transition-all flex flex-col justify-between space-y-3 group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase font-mono tracking-wider px-2 py-0.5 rounded-lg bg-white text-slate-600 border border-slate-200/60">
                  STEP 0{stage.step}
                </span>
                <span className={`w-2 h-2 rounded-full ${stage.dotColor}`} />
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-tight block">
                  {stage.title}
                </span>
                <div className="text-lg font-bold text-slate-900 mt-0.5 font-mono">
                  {stage.value}
                </div>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  {stage.sub}
                </p>
              </div>

              <Link
                href={stage.actionHref}
                className="w-full py-1.5 px-2.5 rounded-xl bg-white hover:bg-slate-900 hover:text-white text-slate-800 text-[11px] font-bold border border-slate-200/80 transition-all text-center block shadow-2xs group-hover:shadow-xs"
              >
                {stage.actionText} →
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* 3. CHARTS SECTION (2 Columns: Striped Machine Output + Spline Yield Area) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Chart: Output Weight by Physical Machine (Striped Lime Bars) */}
        <div className="bg-white rounded-[26px] p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Machine Output Telemetry</h2>
              <p className="text-xs text-slate-400 mt-0.5">Output weight across paper machines (Metric Tons)</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80">
                Active Fleet
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={machineBarData} barGap={8}>
                <defs>
                  {/* SVG Striped Lime Pattern */}
                  <pattern id="millLimeStripes" width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#d4f842" strokeWidth="3.5" />
                    <line x1="3" y1="0" x2="3" y2="6" stroke="#161622" strokeWidth="2.5" />
                  </pattern>
                </defs>
                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}T`}
                />
                <Tooltip
                  cursor={{ fill: "rgba(241, 245, 249, 0.4)" }}
                  contentStyle={{
                    backgroundColor: "#161622",
                    borderRadius: "14px",
                    border: "none",
                    color: "#fff",
                    fontSize: "12px",
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
                  }}
                  itemStyle={{ color: "#d4f842" }}
                />
                <Bar
                  dataKey="actual"
                  name="Reconciled MT"
                  fill="url(#millLimeStripes)"
                  radius={[8, 8, 4, 4]}
                  barSize={24}
                />
                <Bar
                  dataKey="target"
                  name="Capacity Target"
                  fill="#e2e8f0"
                  radius={[8, 8, 4, 4]}
                  barSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-xs text-slate-500 mt-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#d4f842] border border-[#161622]" />
                <span className="font-medium text-slate-700">Actual Produced</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-200" />
                <span className="font-medium text-slate-700">Capacity Rated</span>
              </div>
            </div>
            <span className="font-semibold text-emerald-600">Reconciled Live</span>
          </div>
        </div>

        {/* Right Chart: Trim Loss & Yield Rate Dual-Curve Spline */}
        <div className="bg-white rounded-[26px] p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Trim Wastage & Yield Index</h2>
              <p className="text-xs text-slate-400 mt-0.5">Daily deckle cut loss vs target reference</p>
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-xs font-semibold text-slate-700 transition-colors">
              <span>{timePeriod}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trimChartData}>
                <defs>
                  <linearGradient id="yieldLimeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d4f842" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#d4f842" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="trimOrangeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#f97316" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#161622",
                    borderRadius: "14px",
                    border: "none",
                    color: "#fff",
                    fontSize: "12px",
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="efficiencyRate"
                  name="Yield Index %"
                  stroke="#84cc16"
                  strokeWidth={3}
                  fill="url(#yieldLimeGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="trimLoss"
                  name="Trim Loss %"
                  stroke="#f97316"
                  strokeWidth={2.5}
                  strokeDasharray="4 4"
                  fill="url(#trimOrangeGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-xs text-slate-500 mt-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-lime-500" />
                <span className="font-medium text-slate-700">Yield &gt;97%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                <span className="font-medium text-slate-700">Trim Loss (&lt;3%)</span>
              </div>
            </div>
            <span className="font-semibold text-slate-700 font-mono">Target: ≤ 3.0%</span>
          </div>
        </div>
      </div>

      {/* 4. BOTTOM SECTION (2 Columns: Action Queue + Today's Schedule) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Action Queue / Bottlenecks (Pill Rows) */}
        <div className="bg-white rounded-[26px] p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Action Queue: Bottlenecks</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Orders and runs requiring supervisor review</p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-bold border border-rose-100">
              {actionLists.overdueOrders.length + actionLists.highTrimRuns.length} Items
            </span>
          </div>

          <div className="space-y-3">
            {/* Overdue Orders */}
            {actionLists.overdueOrders.map((o: any) => (
              <div
                key={o.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-rose-50/50 hover:bg-rose-50/80 transition-colors border border-rose-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-900 text-rose-100 flex items-center justify-center font-bold text-sm shadow-sm">
                    !
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <span>{o.clientName}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-mono font-bold">
                        {o.orderNumber}
                      </span>
                    </div>
                    <span className="text-xs text-rose-600 font-medium">
                      Overdue by {o.daysOverdue} days (Due: {o.deliveryDate})
                    </span>
                  </div>
                </div>

                <Link
                  href={`/orders/${o.id}`}
                  className="px-3 py-1.5 rounded-xl bg-white text-slate-800 hover:bg-slate-900 hover:text-white text-xs font-bold border border-slate-200 transition-all shadow-2xs"
                >
                  Resolve
                </Link>
              </div>
            ))}

            {/* High Trim Runs */}
            {actionLists.highTrimRuns.map((r: any) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-50/50 hover:bg-amber-50/80 transition-colors border border-amber-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-900 text-amber-100 flex items-center justify-center font-bold text-sm shadow-sm">
                    %
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <span>{r.machineName}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-mono font-bold">
                        {r.runNumber}
                      </span>
                    </div>
                    <span className="text-xs text-amber-700 font-medium">
                      High Trim Loss: {r.trimPercent.toFixed(2)}% ({r.gsm} GSM)
                    </span>
                  </div>
                </div>

                <Link
                  href={`/production/${r.id}`}
                  className="px-3 py-1.5 rounded-xl bg-white text-slate-800 hover:bg-slate-900 hover:text-white text-xs font-bold border border-slate-200 transition-all shadow-2xs"
                >
                  Inspect
                </Link>
              </div>
            ))}

            {actionLists.overdueOrders.length === 0 && actionLists.highTrimRuns.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2 rounded-2xl bg-slate-50 border border-dashed border-slate-200">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                <span className="font-semibold text-slate-700">No critical bottlenecks detected</span>
                <span className="text-slate-400">All machine runs and client shipments are on track!</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Today's Machine Runs & Active Dispatches */}
        <div className="bg-white rounded-[26px] p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Today&apos;s Mill Schedule</h2>
              <p className="text-xs text-slate-400 mt-0.5">Floor execution and outbound fleet movements</p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">
              {actionLists.todayRuns.length} Runs • {actionLists.todayBatches.length} Trucks
            </span>
          </div>

          <div className="space-y-3">
            {/* Today's Runs */}
            {actionLists.todayRuns.length === 0 ? (
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs text-slate-400 italic">
                No new production runs scheduled for today.
              </div>
            ) : (
              actionLists.todayRuns.map((r: any) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50/80 hover:bg-slate-100/80 transition-colors border border-slate-100"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#161622] text-[#d4f842] flex items-center justify-center font-bold text-xs shadow-sm">
                      PM
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <span>{r.machineName}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-600 font-medium">
                          {r.gsm} GSM
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">{r.runNumber}</span>
                    </div>
                  </div>

                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {r.status}
                  </span>
                </div>
              ))
            )}

            {/* Today's Trucks */}
            {actionLists.todayBatches.map((b: any) => (
              <div
                key={b.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50/70 hover:bg-slate-100/70 transition-colors border border-slate-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#161622] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    <Truck className="h-5 w-5 text-[#d4f842]" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      {b.batchNumber}
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600">
                        {b.truckNumber}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 font-medium">Outbound Load Sheet</span>
                  </div>
                </div>

                <Link
                  href={`/dispatch/${b.id}`}
                  className="px-3 py-1.5 rounded-xl bg-[#161622] text-white hover:bg-[#202030] text-xs font-bold transition-all shadow-xs"
                >
                  Loading Sheet
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
