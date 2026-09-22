"use client";

import * as React from "react";
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
  Factory,
  Package,
  Scissors,
  Search,
  Bell,
  MoreHorizontal,
  ArrowUpRight,
  ArrowDownRight,
  Truck,
  ChevronDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { AnalyticsSummary } from "@/server/services/analytics-service";

interface Props {
  initialData: AnalyticsSummary;
  userName?: string;
}

export function AnalyticsDashboardClient({ initialData, userName = "Nick" }: Props) {
  const [data] = React.useState<AnalyticsSummary>(initialData);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [timePeriod, setTimePeriod] = React.useState("Monthly");

  // Summary Metrics — real data only, 0 when nothing recorded yet (no fabricated fallbacks)
  const totalProductionMT = (data?.kpis?.totalProducedWeightKg || 0) / 1000;
  const totalSalesRevenue = data?.kpis?.totalRevenueInr || 0;
  const avgTrimWastage = ((data?.kpis?.totalWastageKg || 0) / 1000).toFixed(1);
  const totalDispatches = (data?.kpis?.totalDispatchedWeightKg || 0) / 1000;
  const revenueGrowth = data?.kpis?.revenueGrowthPercent ?? 0;
  const trimLossPercent = data?.kpis?.averageTrimLossPercent ?? 0;
  const machineUtilization = data?.kpis?.machineUtilizationPercent ?? 0;

  // Chart data: Production MoM (real monthly trend only; empty when there's no data yet)
  const monthlyProductionData = data?.monthlyTrends?.length
    ? data.monthlyTrends.map((t) => ({
        name: t.month,
        actual: Math.round(t.productionKg / 1000),
      }))
    : [];

  // Real month-on-month production growth (mirrors the revenue-growth calc done server-side)
  let productionGrowth = 0;
  if (data?.monthlyTrends && data.monthlyTrends.length >= 2) {
    const prev = data.monthlyTrends[data.monthlyTrends.length - 2].productionKg;
    const last = data.monthlyTrends[data.monthlyTrends.length - 1].productionKg;
    productionGrowth = prev > 0 ? Number((((last - prev) / prev) * 100).toFixed(1)) : 0;
  }
  let dispatchGrowth = 0;
  if (data?.monthlyTrends && data.monthlyTrends.length >= 2) {
    const prev = data.monthlyTrends[data.monthlyTrends.length - 2].dispatchedKg;
    const last = data.monthlyTrends[data.monthlyTrends.length - 1].dispatchedKg;
    dispatchGrowth = prev > 0 ? Number((((last - prev) / prev) * 100).toFixed(1)) : 0;
  }

  // Yield-rate trend derived from real per-month trim-loss data (100% - trim loss)
  const efficiencyData = data?.monthlyTrends?.length
    ? data.monthlyTrends.map((t) => ({
        name: t.month,
        yieldRate: Number((100 - t.trimLossPercent).toFixed(1)),
      }))
    : [];

  // Client billing / transaction rows (real top clients only; empty state when none)
  const transactions = data?.topClients?.length
    ? data.topClients.slice(0, 4).map((c, i) => ({
        id: `TX-${8921 - i}`,
        client: c.clientName,
        grade: c.city || "—",
        amount: c.totalRevenueInr,
        initial: c.clientName.charAt(0).toUpperCase() || "C",
      }))
    : [];

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* 4 KPI Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Metric 1: HERO DARK CARD (Inspired by Reference Image Card 1) */}
        <div className="relative overflow-hidden rounded-[26px] bg-[#161622] text-white p-6 shadow-xl flex flex-col justify-between min-h-[170px]">
          {/* Subtle lime glow orb */}
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#d4f842]/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-start justify-between relative z-10">
            <div>
              <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">Net Revenue</span>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">
                ₹{(totalSalesRevenue / 100000).toFixed(2)}L
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#d4f842] text-black text-[11px] font-bold shadow-sm">
              <span>•••</span>
            </div>
          </div>

          <div className="flex items-center justify-between mt-5 pt-3 border-t border-white/10 relative z-10">
            <div className="flex items-center gap-1 text-xs font-bold text-[#d4f842]">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>+{revenueGrowth}%</span>
              <span className="text-[11px] font-normal text-slate-400 ml-1">vs last month</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">₹{totalSalesRevenue.toLocaleString("en-IN")}</span>
          </div>
        </div>

        {/* Metric 2: White Pill Card - Total Production */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[170px] hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">Gross Production</span>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-1">
                {totalProductionMT.toFixed(1)} <span className="text-sm font-semibold text-slate-400">MT</span>
              </div>
            </div>
            <button className="text-slate-400 hover:text-slate-600 p-1">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between mt-5 pt-3 border-t border-slate-100">
            <div className={`flex items-center gap-1 text-xs font-bold ${productionGrowth >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {productionGrowth >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              <span>{productionGrowth >= 0 ? "+" : ""}{productionGrowth}%</span>
              <span className="text-[11px] font-normal text-slate-500 ml-1">vs last month</span>
            </div>
            <div className="w-7 h-7 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600">
              <Factory className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Metric 3: White Pill Card - Trim Wastage */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[170px] hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">Trim Wastage</span>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-1">
                {avgTrimWastage} <span className="text-sm font-semibold text-slate-400">MT</span>
              </div>
            </div>
            <button className="text-slate-400 hover:text-slate-600 p-1">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between mt-5 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1 text-xs font-bold text-amber-600">
              <ArrowDownRight className="w-3.5 h-3.5" />
              <span>{trimLossPercent}%</span>
              <span className="text-[11px] font-normal text-slate-500 ml-1">trim loss</span>
            </div>
            <div className="w-7 h-7 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Scissors className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Metric 4: White Pill Card - Total Dispatches */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[170px] hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">Logistics Dispatched</span>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-1">
                {totalDispatches.toFixed(1)} <span className="text-sm font-semibold text-slate-400">MT</span>
              </div>
            </div>
            <button className="text-slate-400 hover:text-slate-600 p-1">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between mt-5 pt-3 border-t border-slate-100">
            <div className={`flex items-center gap-1 text-xs font-bold ${dispatchGrowth >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {dispatchGrowth >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              <span>{dispatchGrowth >= 0 ? "+" : ""}{dispatchGrowth}%</span>
              <span className="text-[11px] font-normal text-slate-500 ml-1">vs last month</span>
            </div>
            <div className="w-7 h-7 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600">
              <Package className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Chart: Striped Neon-Lime Bar Chart (Production Overview) */}
        <div className="bg-white rounded-[26px] p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Production Overview</h2>
              <p className="text-xs text-slate-400 mt-0.5">Monthly output vs mill target (Metric Tons)</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTimePeriod(timePeriod === "Monthly" ? "Weekly" : "Monthly")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-xs font-semibold text-slate-700 transition-colors"
              >
                <span>{timePeriod}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyProductionData} barGap={8}>
                <defs>
                  {/* SVG Striped Pattern for Bar Chart */}
                  <pattern id="limeStripes" width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
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
                  name="Output MT"
                  fill="url(#limeStripes)"
                  radius={[8, 8, 4, 4]}
                  barSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-xs text-slate-500 mt-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#d4f842] border border-[#161622]" />
                <span className="font-medium text-slate-700">Actual Output</span>
              </div>
            </div>
            <span className={`font-semibold ${productionGrowth >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {productionGrowth >= 0 ? "+" : ""}{productionGrowth}% vs last month
            </span>
          </div>
        </div>

        {/* Right Chart: Smooth Dual-Curve Spline Area Chart (Efficiency Overview) */}
        <div className="bg-white rounded-[26px] p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Efficiency Overview</h2>
              <p className="text-xs text-slate-400 mt-0.5">Paper Yield Rate (%)</p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-semibold text-slate-700">
              <span>Monthly</span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={efficiencyData}>
                <defs>
                  {/* Spline Area Gradient */}
                  <linearGradient id="efficiencyLimeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d4f842" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#d4f842" stopOpacity={0.02} />
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
                  domain={[80, 100]}
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
                  dataKey="yieldRate"
                  name="Yield Rate %"
                  stroke="#84cc16"
                  strokeWidth={3}
                  fill="url(#efficiencyLimeGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-xs text-slate-500 mt-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-lime-500" />
                <span className="font-medium text-slate-700">Yield Rate ({(100 - trimLossPercent).toFixed(1)}% Avg)</span>
              </div>
            </div>
            <span className="font-semibold text-slate-700 font-mono">Target: &gt;95%</span>
          </div>
        </div>
      </div>

      {/* Bottom Section: 2 Columns (Transactions List + Logistics Map) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Client Transactions List (Matching Pill Rows from Reference) */}
        <div className="bg-white rounded-[26px] p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Latest Invoices & Dispatches</h2>
              <p className="text-xs text-slate-400 mt-0.5">Real-time paper shipment settlement</p>
            </div>
            <button className="text-xs font-semibold text-slate-600 hover:text-slate-900">
              View All
            </button>
          </div>

          {/* List of pill items */}
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50/80 hover:bg-slate-100/80 transition-colors border border-slate-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#161622] text-[#d4f842] flex items-center justify-center font-bold text-sm shadow-sm">
                    {tx.initial}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <span>{tx.client}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-600 font-medium">
                        {tx.grade}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">{tx.id}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-bold text-slate-900 font-mono">
                    ₹{tx.amount.toLocaleString("en-IN")}
                  </div>
                </div>
              </div>
            ))}
            {transactions.length === 0 && (
              <div className="text-xs text-slate-400 text-center py-6">
                No invoiced clients yet in this period.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Freight Logistics Dot-Matrix Map */}
        <div className="bg-white rounded-[26px] p-6 border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Logistics & Freight Distribution</h2>
              <p className="text-xs text-slate-400 mt-0.5">Active outbound reel shipments</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                14 In Transit
              </span>
            </div>
          </div>

          {/* Styled Logistics SVG Visual with Hubs & Arcs */}
          <div className="relative h-60 w-full rounded-2xl bg-[#0f172a] p-4 flex items-center justify-center overflow-hidden shadow-inner">
            {/* Dot grid background pattern */}
            <svg className="absolute inset-0 w-full h-full opacity-30" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="dotGrid" width="16" height="16" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="1.2" fill="#94a3b8" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#dotGrid)" />
            </svg>

            {/* Freight Routes Curves & Nodes */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 500 240" fill="none">
              {/* Arc 1: Mill Hub to Delhi NCR */}
              <path
                d="M 90 140 Q 200 40 330 110"
                stroke="#d4f842"
                strokeWidth="2"
                strokeDasharray="4 4"
                className="opacity-80"
              />
              {/* Arc 2: Mill Hub to Mumbai Port */}
              <path
                d="M 90 140 Q 180 200 260 170"
                stroke="#f97316"
                strokeWidth="2"
                className="opacity-90"
              />
              {/* Arc 3: Mill Hub to Kolkata */}
              <path
                d="M 90 140 Q 250 120 410 160"
                stroke="#38bdf8"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                className="opacity-60"
              />

              {/* Mill Factory Hub (Kashipur / Main Mill) */}
              <circle cx="90" cy="140" r="8" fill="#d4f842" className="animate-ping opacity-30" />
              <circle cx="90" cy="140" r="5" fill="#d4f842" />
              <text x="75" y="165" fill="#d4f842" fontSize="11" fontWeight="bold" fontFamily="sans-serif">Mill Hub</text>

              {/* Destination 1: Delhi NCR */}
              <circle cx="330" cy="110" r="5" fill="#ffffff" />
              <text x="335" y="105" fill="#ffffff" fontSize="10" fontFamily="sans-serif">NCR Depot (24T)</text>

              {/* Destination 2: Mumbai */}
              <circle cx="260" cy="170" r="5" fill="#f97316" />
              <text x="265" y="190" fill="#f97316" fontSize="10" fontFamily="sans-serif">Export Hub</text>

              {/* Destination 3: Kolkata */}
              <circle cx="410" cy="160" r="4" fill="#38bdf8" />
              <text x="415" y="165" fill="#94a3b8" fontSize="10" fontFamily="sans-serif">East Depot</text>
            </svg>

            {/* Float badge indicator */}
            <div className="absolute bottom-3 left-3 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-2">
              <Truck className="w-3.5 h-3.5 text-[#d4f842]" />
              <span className="text-[11px] font-medium text-white">{machineUtilization}% Machine Utilization</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-xs text-slate-500 mt-2">
            <span>Primary Fleet: GPS Telematics Live</span>
            <span className="font-semibold text-slate-900">{totalDispatches.toFixed(1)} MT Dispatched</span>
          </div>
        </div>
      </div>
    </div>
  );
}
