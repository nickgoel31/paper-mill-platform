"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { formatCurrencyINR, formatWeightKg, formatTrimPercent } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  Scissors,
  TrendingDown,
  Factory,
  Package,
  Truck,
  CreditCard,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Users,
  MessageSquare,
  FileSpreadsheet,
  ArrowRight,
  Sparkles,
  Layers,
  ChevronRight,
  Play,
  ShoppingCart,
  Send,
  ReceiptText,
  Plus,
  BookOpen,
  Filter,
  MoreVertical,
  Activity,
  FileText,
} from "lucide-react";
import { Role } from "@prisma/client";

interface ExecutiveDashboardViewProps {
  data: any;
  userRole: Role;
}

export function ExecutiveDashboardView({ data, userRole }: ExecutiveDashboardViewProps) {
  const [periodDays, setPeriodDays] = React.useState("30");
  const { kpis, charts, actionLists } = data;

  const isAdminOrSales = userRole === Role.ADMIN || userRole === Role.SALES;
  const isTrimGood = kpis.avgTrimPercent30d <= 3.0;
  const isTrimWarning = kpis.avgTrimPercent30d > 3.0 && kpis.avgTrimPercent30d <= 6.0;

  // Capacity calculation based on active orders vs standard mill target (~11.6 MT)
  const targetCapacityMt = 11.6;
  const currentDemandMt = Number((kpis.pendingKg / 1000).toFixed(1));
  const utilizationPercent = Math.min(
    Math.round((currentDemandMt / (targetCapacityMt || 1)) * 100) || 85,
    100
  );

  const pipelineStages = [
    {
      step: 1,
      name: "Sales Orders",
      icon: ShoppingCart,
      count: `${kpis.openOrdersCount}`,
      countLabel: "Active",
      subMetric: `${(kpis.pendingKg / 1000).toFixed(1)} MT Demanded`,
      href: "/orders",
      actionText: "Book Order",
      actionHref: "/orders/new",
      iconBg: "bg-sky-50 text-sky-500",
      btnClass: "text-sky-600 bg-sky-50/70 hover:bg-sky-100 hover:text-sky-700",
    },
    {
      step: 2,
      name: "Deckle Planning",
      icon: Scissors,
      count: `${(kpis.pendingKg / 1000).toFixed(1)}`,
      countLabel: "MT to Plan",
      subMetric: `Target: ≤ 3.0% Trim`,
      href: "/deckle",
      actionText: "Optimize Deckle",
      actionHref: "/deckle",
      iconBg: "bg-purple-50 text-purple-500",
      btnClass: "text-purple-600 bg-purple-50/70 hover:bg-purple-100 hover:text-purple-700",
    },
    {
      step: 3,
      name: "Floor Production",
      icon: Activity,
      count: `${(kpis.totalProducedKgThisMonth / 1000).toFixed(1)}`,
      countLabel: "MT Month",
      subMetric: `${actionLists.todayRuns.length} Runs Active Today`,
      href: "/production",
      actionText: "Floor Tablet",
      actionHref: "/operator",
      iconBg: "bg-amber-50 text-amber-500",
      btnClass: "text-amber-600 bg-amber-50/70 hover:bg-amber-100 hover:text-amber-700",
    },
    {
      step: 4,
      name: "Load & Dispatch",
      icon: Send,
      count: `${kpis.dispatchesThisWeek}`,
      countLabel: "Dispatches",
      subMetric: `${actionLists.todayBatches.length} Trucks Today`,
      href: "/dispatch",
      actionText: "Dispatch Desk",
      actionHref: "/dispatch",
      iconBg: "bg-emerald-50 text-emerald-500",
      btnClass: "text-emerald-600 bg-emerald-50/70 hover:bg-emerald-100 hover:text-emerald-700",
    },
    {
      step: 5,
      name: "GST Invoices",
      icon: FileText,
      count: `${formatCurrencyINR(kpis.invoicedThisMonth)}`,
      countLabel: "",
      subMetric: "Automated Tax Bills",
      href: "/invoices",
      actionText: "Invoicing",
      actionHref: "/invoices",
      iconBg: "bg-blue-50 text-blue-500",
      btnClass: "text-blue-600 bg-blue-50/70 hover:bg-blue-100 hover:text-blue-700",
    },
  ];

  return (
    <div className="space-y-7 font-sans pb-10">
      {/* 1. HERO 3D ISOMETRIC BANNER CARD */}
      <div className="relative w-full rounded-2xl overflow-hidden shadow-sm border border-slate-200/80 bg-slate-900 min-h-[260px] md:min-h-[300px] flex items-center">
        {/* Background 3D Eco-Paper Logistics Image */}
        <div className="absolute inset-0">
          <Image
            src="/images/mill-hero-banner.jpg"
            alt="Eco-Paper Logistics 3D Mill Overview"
            fill
            priority
            className="object-cover object-center opacity-90"
          />
          {/* Subtle Gradient Overlay for Text Readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/80 to-transparent md:to-white/10" />
        </div>

        {/* Content Inside Banner */}
        <div className="relative z-10 w-full p-4 sm:p-8 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6">
          {/* Left Text & Action Buttons */}
          <div className="max-w-xl space-y-2.5 sm:space-y-3.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-sky-100/90 text-sky-700 text-[10px] sm:text-[11px] font-bold tracking-wide uppercase shadow-xs">
              MILL OPERATIONS OVERVIEW
            </div>

            <h1 className="text-xl sm:text-3xl lg:text-[32px] font-black tracking-tight text-slate-900 leading-[1.2]">
              Real-time deckle optimization, production slitting, load planning, and logistics dispatch status.
            </h1>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-1 sm:pt-2">
              <Button
                asChild
                className="h-9 sm:h-10 px-4 sm:px-5 rounded-xl bg-sky-400 hover:bg-sky-500 text-white font-bold text-xs gap-1.5 shadow-md shadow-sky-400/25 transition-all"
              >
                <Link href="/deckle">
                  <Plus className="h-4 w-4 stroke-[2.5]" /> New Run
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                className="h-9 sm:h-10 px-3.5 sm:px-5 rounded-xl bg-white/90 hover:bg-white text-slate-700 border-slate-200 text-xs font-bold gap-2 shadow-xs backdrop-blur"
              >
                <Link href="/guide">
                  <BookOpen className="h-4 w-4 text-slate-500" /> System Guide
                </Link>
              </Button>
            </div>
          </div>

          {/* Right Floating Frosted Glass KPI Widget */}
          <div className="flex md:flex flex-col justify-center p-4 sm:p-5 rounded-2xl bg-white/90 backdrop-blur-md border border-white/60 shadow-lg shadow-slate-900/5 min-w-[240px] sm:min-w-[280px]">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Production Capacity
            </span>

            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl sm:text-4xl font-black text-sky-500 font-mono tracking-tight">
                {utilizationPercent}%
              </span>
              <span className="text-xs font-semibold text-slate-600">Utilized</span>
            </div>

            {/* Custom Cyan Progress Bar */}
            <div className="w-full bg-slate-100 rounded-full h-2 mt-2.5 sm:mt-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-sky-400 to-sky-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${utilizationPercent}%` }}
              />
            </div>

            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-500 font-medium mt-2.5 sm:mt-3">
              <Sparkles className="h-3.5 w-3.5 text-sky-500" />
              <span>
                <strong>{currentDemandMt} MT</strong> / {targetCapacityMt} MT Target
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 5-STEP MILL PRODUCTION FLOW */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 tracking-tight">
            5-Step Mill Production Flow
          </h2>

          <div className="flex items-center gap-1 text-slate-400">
            <button className="p-1.5 hover:text-slate-600 rounded-md transition-colors" title="Filter Flow">
              <Filter className="h-4 w-4" />
            </button>
            <button className="p-1.5 hover:text-slate-600 rounded-md transition-colors" title="More Options">
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 5 Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {pipelineStages.map((stage) => {
            const Icon = stage.icon;
            return (
              <div
                key={stage.step}
                className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-slate-200 transition-all duration-200 flex flex-col justify-between space-y-4"
              >
                {/* Top: Icon + Step Badge */}
                <div className="flex items-center justify-between">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${stage.iconBg}`}>
                    <Icon className="h-5 w-5 stroke-[2]" />
                  </div>

                  <span className="text-[10px] font-extrabold uppercase font-mono tracking-wider px-2 py-0.5 rounded-md bg-slate-100/80 text-slate-500">
                    STEP {stage.step}
                  </span>
                </div>

                {/* Middle: Title & Metrics */}
                <div className="space-y-1">
                  <Link
                    href={stage.href}
                    className="font-bold text-sm text-slate-900 hover:text-sky-600 transition-colors block"
                  >
                    {stage.name}
                  </Link>

                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-extrabold font-mono text-slate-900 tracking-tight">
                      {stage.count}
                    </span>
                    {stage.countLabel && (
                      <span className="text-xs text-slate-500 font-medium">
                        {stage.countLabel}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400 font-medium">
                    {stage.subMetric}
                  </p>
                </div>

                {/* Bottom: Pill Action Button */}
                <Button
                  asChild
                  className={`w-full h-8 text-xs font-bold rounded-xl shadow-none transition-all ${stage.btnClass}`}
                >
                  <Link href={stage.actionHref}>
                    {stage.actionText}
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. PERFORMANCE METRICS (KPI ROW) */}
      <div className="space-y-3.5 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 tracking-tight">
            Performance Metrics
          </h2>

          {/* Period Selector */}
          <Select value={periodDays} onValueChange={setPeriodDays}>
            <SelectTrigger className="h-8 text-xs w-[130px] bg-white rounded-xl border-slate-200 shadow-none font-medium">
              <Calendar className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 Days</SelectItem>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="90">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 5 Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* 1. AVG TRIM (30D) */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-3">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                AVG TRIM (30D)
              </span>
              <Scissors className="h-4 w-4 text-emerald-500" />
            </div>

            <div>
              <div className="text-2xl font-black font-mono text-slate-900">
                {kpis.avgTrimPercent30d}%
              </div>
              <div className="mt-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  <CheckCircle2 className="h-3 w-3" /> Optimal (≤3%)
                </span>
              </div>
            </div>
          </div>

          {/* 2. OPEN DEMAND */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-3">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                OPEN DEMAND
              </span>
              <Package className="h-4 w-4 text-sky-500" />
            </div>

            <div>
              <div className="text-2xl font-black font-mono text-slate-900">
                {(kpis.pendingKg / 1000).toFixed(1)} <span className="text-sm font-semibold text-slate-400 font-sans">MT</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 font-medium">
                {kpis.openOrdersCount} Confirmed Orders
              </p>
            </div>
          </div>

          {/* 3. DUE THIS WEEK */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-3">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                DUE THIS WEEK
              </span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>

            <div>
              <div className="text-2xl font-black font-mono text-slate-900">
                {kpis.dueThisWeekCount} <span className="text-sm font-semibold text-slate-400 font-sans">Orders</span>
              </div>
              <p className="text-[11px] text-rose-600 mt-1.5 font-bold flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 inline" /> {kpis.overdueCount} Overdue
              </p>
            </div>
          </div>

          {/* 4. PRODUCED (MO) */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-3">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                PRODUCED (MO)
              </span>
              <Factory className="h-4 w-4 text-emerald-500" />
            </div>

            <div>
              <div className="text-2xl font-black font-mono text-slate-900">
                {(kpis.totalProducedKgThisMonth / 1000).toFixed(1)} <span className="text-sm font-semibold text-slate-400 font-sans">MT</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 font-medium">
                Floor output reconciled
              </p>
            </div>
          </div>

          {/* 5. INVOICED (MO) */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-3">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                INVOICED (MO)
              </span>
              <CreditCard className="h-4 w-4 text-purple-500" />
            </div>

            <div>
              <div className="text-2xl font-black font-mono text-slate-900 truncate">
                {formatCurrencyINR(kpis.invoicedThisMonth)}
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 font-medium">
                GST Tax Billing
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 4. ANALYTICAL CHARTS (Row 1: Trim Trend & Production by Machine) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
        {/* Trim Trend Line Chart with 3% Target Line */}
        <Card className="rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-sky-500" />
              Daily Average Trim % (Target: 3.0%)
            </CardTitle>
            <CardDescription className="text-xs">
              Daily deckle optimization loss vs the 3% target reference line.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[270px]">
            {charts.trimTrendData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                No production runs in this period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={charts.trimTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis unit="%" domain={[0, "auto"]} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(val: any) => [`${val}%`, "Avg Trim"]} />
                  <ReferenceLine
                    y={3.0}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    label={{ value: "3% Target", fill: "#10b981", fontSize: 10, position: "top" }}
                  />
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
          </CardContent>
        </Card>

        {/* Production kg by Machine */}
        <Card className="rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Factory className="h-4 w-4 text-sky-500" />
              Reconciled Output Weight by Physical Machine
            </CardTitle>
            <CardDescription className="text-xs">
              Total kilograms produced across dynamic paper machines.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[270px]">
            {charts.productionByMachineData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                No production output data available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.productionByMachineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                  <XAxis dataKey="machine" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}t`} />
                  <Tooltip formatter={(val: any) => [`${val.toLocaleString()} kg`, "Weight"]} />
                  <Bar dataKey="weightKg" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 5. ACTION QUEUES (Needs Attention & Today's Schedule) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Needs Attention Queue */}
        <Card className="rounded-2xl border border-rose-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] overflow-hidden">
          <CardHeader className="pb-3 bg-rose-50/40 border-b border-rose-100/60">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-rose-950 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                Action Queue: Needs Attention
              </CardTitle>
              <Badge variant="destructive" className="font-mono text-[10px] rounded-md">
                {actionLists.overdueOrders.length +
                  actionLists.highTrimRuns.length +
                  kpis.failedNotificationsCount}{" "}
                Items
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {/* Overdue Orders */}
            {actionLists.overdueOrders.map((o: any) => (
              <div
                key={o.id}
                className="flex items-center justify-between p-3 rounded-xl bg-rose-50/70 border border-rose-200 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="font-mono text-slate-900">{o.orderNumber}</strong>
                    <span className="text-rose-900 font-semibold">{o.clientName}</span>
                  </div>
                  <span className="text-[11px] text-rose-700">
                    Overdue by {o.daysOverdue} days (Due: {o.deliveryDate})
                  </span>
                </div>
                <Button asChild variant="outline" size="sm" className="h-7 text-[11px] bg-white rounded-lg border-rose-200">
                  <Link href={`/orders/${o.id}`}>Resolve</Link>
                </Button>
              </div>
            ))}

            {/* High Trim Runs */}
            {actionLists.highTrimRuns.map((r: any) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="font-mono text-slate-900">{r.runNumber}</strong>
                    <span className="text-amber-900 font-semibold">
                      {r.machineName} ({r.gsm} GSM)
                    </span>
                  </div>
                  <span className="text-[11px] text-amber-700 font-bold">
                    High Trim Loss: {r.trimPercent.toFixed(2)}%
                  </span>
                </div>
                <Button asChild variant="outline" size="sm" className="h-7 text-[11px] bg-white rounded-lg border-amber-200">
                  <Link href={`/production/${r.id}`}>Inspect</Link>
                </Button>
              </div>
            ))}

            {/* Failed WhatsApp Notifications */}
            {kpis.failedNotificationsCount > 0 && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-red-50 border border-red-200 text-xs">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-red-600" />
                  <span className="text-red-900 font-bold">
                    {kpis.failedNotificationsCount} Failed WhatsApp Messages
                  </span>
                </div>
                <Button asChild variant="outline" size="sm" className="h-7 text-[11px] bg-white rounded-lg">
                  <Link href="/notifications">Retry Queue</Link>
                </Button>
              </div>
            )}

            {actionLists.overdueOrders.length === 0 &&
              actionLists.highTrimRuns.length === 0 &&
              kpis.failedNotificationsCount === 0 && (
                <div className="p-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  No critical bottlenecks detected. All orders and runs on schedule!
                </div>
              )}
          </CardContent>
        </Card>

        {/* Today's Schedule */}
        <Card className="rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
          <CardHeader className="pb-3 bg-slate-50/60 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-sky-500" />
                Today&apos;s Mill Schedule
              </CardTitle>
              <Badge variant="outline" className="font-mono text-[10px] rounded-md">
                {actionLists.todayRuns.length} Runs • {actionLists.todayBatches.length} Trucks
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {/* Today's Runs */}
            <span className="text-[11px] uppercase font-bold text-slate-400 block">
              Machine Runs Active Today:
            </span>
            {actionLists.todayRuns.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">No new runs created today.</div>
            ) : (
              actionLists.todayRuns.map((r: any) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <strong className="font-mono text-slate-900">{r.runNumber}</strong>
                    <span className="text-slate-800">
                      {r.machineName} • {r.gsm} GSM
                    </span>
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px] rounded-md">
                    {r.status}
                  </Badge>
                </div>
              ))
            )}

            <span className="text-[11px] uppercase font-bold text-slate-400 block pt-2 border-t border-slate-100">
              Planned Truck Dispatches Today:
            </span>
            {actionLists.todayBatches.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">No trucks planned for departure today.</div>
            ) : (
              actionLists.todayBatches.map((b: any) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-sky-50/50 border border-sky-100 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <strong className="font-mono text-slate-900">{b.batchNumber}</strong>
                    <span className="text-slate-700 font-mono">Vehicle: {b.truckNumber}</span>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="h-6 text-[11px] text-sky-600 font-bold hover:text-sky-700">
                    <Link href={`/dispatch/${b.id}`}>Loading Sheet</Link>
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
