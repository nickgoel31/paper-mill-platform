"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  IndianRupee,
  Factory,
  Package,
  Scissors,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Download,
  Filter,
  Users,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { AnalyticsSummary, getAnalyticsData, AnalyticsFilter } from "@/server/services/analytics-service";
import { toast } from "sonner";

const COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#64748b"];
const WASTAGE_COLORS = ["#f59e0b", "#ef4444", "#64748b"];

interface Props {
  initialData: AnalyticsSummary;
}

export function AnalyticsDashboardClient({ initialData }: Props) {
  const [data, setData] = React.useState<AnalyticsSummary>(initialData);
  const [timeRange, setTimeRange] = React.useState<string>("last_6_months");
  const [startDate, setStartDate] = React.useState<string>("");
  const [endDate, setEndDate] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [activeTab, setActiveTab] = React.useState<"overview" | "sales" | "wastage" | "production">("overview");

  const handleFilterChange = async (newRange?: string, customStart?: string, customEnd?: string) => {
    setIsLoading(true);
    try {
      const selectedRange = newRange || timeRange;
      const filterPayload: AnalyticsFilter = {
        timeRange: selectedRange as any,
        startDate: customStart || (startDate ? startDate : undefined),
        endDate: customEnd || (endDate ? endDate : undefined),
      };

      const refreshed = await getAnalyticsData(filterPayload);
      setData(refreshed);
      toast.success("Analytics updated for selected date range.");
    } catch (err: any) {
      toast.error("Failed to load analytics: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const { kpis, monthlyTrends, wastageBreakdown, gsmDistribution, machinePerformance, topClients } = data;

  return (
    <div className="space-y-6 pb-12">
      {/* ------------------------------------------------------------------- */}
      {/* 1. HEADER & CONTROLS                                                */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center font-bold">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Business Analytics & Performance
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Month-on-Month Paper Mill Sales, Production Output, and Trim Wastage Analytics
              </p>
            </div>
          </div>
        </div>

        {/* Date Filter Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Select
            value={timeRange}
            onValueChange={(val) => {
              setTimeRange(val);
              if (val !== "custom") {
                handleFilterChange(val);
              }
            }}
          >
            <SelectTrigger className="w-[160px] h-9 text-xs font-semibold bg-slate-50 border-slate-200">
              <Calendar className="h-3.5 w-3.5 text-slate-500 mr-2" />
              <SelectValue placeholder="Select Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last_3_months">Last 3 Months</SelectItem>
              <SelectItem value="last_6_months">Last 6 Months</SelectItem>
              <SelectItem value="last_12_months">Last 12 Months</SelectItem>
              <SelectItem value="this_year">Year to Date (2026)</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {timeRange === "custom" && (
            <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200">
              <Input
                type="date"
                className="h-7 text-[11px] bg-white w-32 px-1.5"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <span className="text-xs text-slate-400 font-medium">to</span>
              <Input
                type="date"
                className="h-7 text-[11px] bg-white w-32 px-1.5"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <Button
                size="sm"
                className="h-7 text-xs px-2.5 bg-slate-900 text-white"
                onClick={() => handleFilterChange("custom", startDate, endDate)}
                disabled={!startDate || !endDate || isLoading}
              >
                Apply
              </Button>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleFilterChange()}
            disabled={isLoading}
            className="h-9 px-3 text-xs gap-1.5 font-semibold text-slate-600 border-slate-200 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 2. EXECUTIVE KPI TILES                                              */}
      {/* ------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <Card className="border-slate-200/80 shadow-sm bg-gradient-to-br from-white to-sky-50/30">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Gross Revenue
              </span>
              <div className="h-7 w-7 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center">
                <IndianRupee className="h-4 w-4" />
              </div>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 tracking-tight">
                ₹{(kpis.totalRevenueInr / 100000).toFixed(2)} Lakh
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold px-1.5 py-0">
                  +{kpis.revenueGrowthPercent}% MoM
                </Badge>
                <span className="text-[10px] text-slate-400 font-mono">
                  (₹{kpis.totalRevenueInr.toLocaleString("en-IN")})
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Paper Production */}
        <Card className="border-slate-200/80 shadow-sm bg-gradient-to-br from-white to-emerald-50/30">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Total Production
              </span>
              <div className="h-7 w-7 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Factory className="h-4 w-4" />
              </div>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 tracking-tight">
                {(kpis.totalProducedWeightKg / 1000).toFixed(2)} MT
              </span>
              <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500">
                <span className="font-semibold text-emerald-600">
                  {kpis.machineUtilizationPercent}%
                </span>
                <span>Machine Utilization</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trim Wastage */}
        <Card className="border-slate-200/80 shadow-sm bg-gradient-to-br from-white to-amber-50/30">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Avg Trim Loss
              </span>
              <div className="h-7 w-7 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                <Scissors className="h-4 w-4" />
              </div>
            </div>
            <div>
              <span className="text-2xl font-black text-amber-600 tracking-tight">
                {kpis.averageTrimLossPercent}%
              </span>
              <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500">
                <span className="font-mono font-bold text-slate-700">
                  {(kpis.totalWastageKg / 1000).toFixed(2)} MT
                </span>
                <span>Total Scrap Logged</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dispatch Delivery */}
        <Card className="border-slate-200/80 shadow-sm bg-gradient-to-br from-white to-purple-50/30">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Orders & Clients
              </span>
              <div className="h-7 w-7 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                <Package className="h-4 w-4" />
              </div>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 tracking-tight">
                {kpis.totalOrdersCount} Orders
              </span>
              <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500">
                <span className="font-semibold text-purple-600">
                  {kpis.activeClientsCount} Active Buyers
                </span>
                <span>• {(kpis.totalDispatchedWeightKg / 1000).toFixed(1)} MT sent</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 3. CHARTS ROW 1: MONTH ON MONTH SALES & PRODUCTION TRENDS           */}
      {/* ------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Sales vs Production Trend (2 Cols) */}
        <Card className="lg:col-span-2 border-slate-200/80 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900">
                  Month-on-Month Sales vs. Production (MT)
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Comparing customer sales volume demanded against finished reel factory production
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-sky-50 text-sky-700 border-sky-200 text-[10px] font-bold">
                  Sales (MT)
                </Badge>
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                  Production (MT)
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={monthlyTrends.map((t) => ({
                    ...t,
                    salesMT: Number((t.salesWeightKg / 1000).toFixed(2)),
                    productionMT: Number((t.productionKg / 1000).toFixed(2)),
                  }))}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorProd" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      border: "none",
                      borderRadius: "12px",
                      color: "#fff",
                      fontSize: "12px",
                    }}
                    formatter={(val: any, name?: any) => [
                      `${val} MT`,
                      name === "salesMT" ? "Sales Demanded" : "Factory Output",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="salesMT"
                    stroke="#0ea5e9"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorSales)"
                  />
                  <Area
                    type="monotone"
                    dataKey="productionMT"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorProd)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Wastage Composition Pie Chart (1 Col) */}
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-900">
              Wastage & Trim Scrap Analysis
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Breakdown of slitter edge trim vs. rejections
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-[200px] w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={wastageBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="weightKg"
                  >
                    {wastageBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={WASTAGE_COLORS[index % WASTAGE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      borderRadius: "8px",
                      color: "#fff",
                      fontSize: "11px",
                    }}
                    formatter={(val: any) => [`${Number(val).toLocaleString("en-IN")} kg`, "Scrap Weight"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend Breakdown List */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              {wastageBreakdown.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: WASTAGE_COLORS[idx % WASTAGE_COLORS.length] }}
                    />
                    <span className="text-slate-600 font-medium">{item.type}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-slate-900 font-bold">{item.weightKg.toLocaleString("en-IN")} kg</span>
                    <span className="text-slate-400 text-[10px]">({item.percent}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 4. CHARTS ROW 2: TRIM LOSS TRENDS & GSM BREAKDOWN                   */}
      {/* ------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Month-on-Month Trim Loss % (1 Col) */}
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-900">
              Trim Waste % Optimization Trend
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Target: Maintain below 2.0% average mill trim
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={monthlyTrends}
                  margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis domain={[0, 4]} tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      borderRadius: "8px",
                      color: "#fff",
                      fontSize: "11px",
                    }}
                    formatter={(val: any) => [`${val}%`, "Trim Loss"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="trimLossPercent"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    dot={{ fill: "#f59e0b", r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-center">
              <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                ✨ Deckle Solver reduced trim loss to {kpis.averageTrimLossPercent}%
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Paper GSM Demand Breakdown (1 Col) */}
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-900">
              Production by Paper GSM
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Distribution of produced weight across GSM grades
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {gsmDistribution.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">{item.gsm}</span>
                  <span className="font-mono text-slate-500 text-[11px]">
                    {(item.weightKg / 1000).toFixed(2)} MT ({item.percentage}%)
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: COLORS[idx % COLORS.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Machine Performance & Deckle Fit (1 Col) */}
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-900">
              Machine Deckle Performance
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Efficiency and trim loss by Paper Machine
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-3 space-y-3">
            {machinePerformance.map((m, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900">
                    {m.machineName} ({m.code})
                  </span>
                  <Badge className="bg-sky-50 text-sky-700 border-sky-200 text-[10px] font-bold">
                    {m.runsCount} Runs
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                  <span>Output: <strong>{(m.totalOutputKg / 1000).toFixed(2)} MT</strong></span>
                  <span>Trim: <strong className="text-emerald-600">{m.avgTrimPercent}%</strong></span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 5. TOP CLIENTS & REVENUE PERFORMANCE TABLE                          */}
      {/* ------------------------------------------------------------------- */}
      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900">
                Top Client Accounts & Volume Demand
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Key buyers ranked by total paper reel consumption and order value
              </CardDescription>
            </div>
            <Badge className="bg-slate-100 text-slate-700 font-mono text-xs">
              {topClients.length} Accounts
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-xs text-left divide-y divide-slate-100">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Client / Business</th>
                  <th className="p-3">Location</th>
                  <th className="p-3 text-center">Orders</th>
                  <th className="p-3 text-right">Total Weight</th>
                  <th className="p-3 text-right">Est. Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topClients.map((c, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3 font-bold text-slate-900">
                      {c.clientName}
                    </td>
                    <td className="p-3 text-slate-500">
                      📍 {c.city}
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-slate-700">
                      {c.ordersCount}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900">
                      {(c.totalWeightKg / 1000).toFixed(3)} MT
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-600">
                      ₹{c.totalRevenueInr > 0 ? c.totalRevenueInr.toLocaleString("en-IN") : (c.totalWeightKg * 33.5 * 1.18).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
