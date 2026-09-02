"use client";

import * as React from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { RunStatus, Role } from "@prisma/client";
import {
  getProductionRuns,
  getProductionSummaryStats,
  releaseRunToFloor,
  cancelProductionRun,
} from "@/server/services/production-service";
import { formatWeightKg, formatTrimPercent } from "@/lib/utils";
import {
  Factory,
  Layers,
  MoreHorizontal,
  Eye,
  CheckCircle2,
  XCircle,
  TrendingDown,
  Gauge,
  Play,
  Filter,
  X,
  Plus,
  Activity,
  Tablet,
  Sparkles,
} from "lucide-react";
import { WorkflowBanner } from "@/components/layout/workflow-banner";

interface MachineRef {
  id: string;
  name: string;
  code: string;
  maxDeckleInch: any;
}

interface ProductionRunRow {
  id: string;
  runNumber: string;
  gsm: number;
  status: RunStatus;
  totalPlannedKg: any;
  totalActualKg: any;
  totalTrimPercent: any;
  createdAt: Date | string;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  machine: MachineRef;
  patterns: { id: string; sequence: number }[];
}

interface RunListProps {
  initialData: {
    rows: ProductionRunRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  initialStats: {
    runsToday: number;
    runningNow: number;
    avgTrimWeek: number;
    totalKgProducedWeek: number;
  };
  machinesList: { id: string; name: string; code: string }[];
  userRole: Role;
}

export function ProductionRunList({
  initialData,
  initialStats,
  machinesList,
  userRole,
}: RunListProps) {
  const [data, setData] = React.useState(initialData.rows);
  const [total, setTotal] = React.useState(initialData.total);
  const [page, setPage] = React.useState(initialData.page);
  const [pageSize, setPageSize] = React.useState(initialData.pageSize);
  const [totalPages, setTotalPages] = React.useState(initialData.totalPages);
  const [stats, setStats] = React.useState(initialStats);

  // Filter states
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [machineFilter, setMachineFilter] = React.useState<string>("ALL");
  const [gsmFilter, setGsmFilter] = React.useState<string>("ALL");
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState(false);

  const isPlannerOrAdmin = userRole === Role.ADMIN || userRole === Role.PLANNER;
  const isOperatorOrAdmin =
    userRole === Role.ADMIN || userRole === Role.OPERATOR || userRole === Role.PLANNER;

  const fetchFilteredRuns = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getProductionRuns({
        status: statusFilter === "ALL" ? undefined : (statusFilter as RunStatus),
        machineId: machineFilter === "ALL" ? undefined : machineFilter,
        gsm: gsmFilter === "ALL" ? undefined : Number(gsmFilter),
        search: searchQuery || undefined,
        page,
        pageSize,
      });

      const st = await getProductionSummaryStats();
      setData(res.rows as ProductionRunRow[]);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setStats(st);
    } catch (err: any) {
      toast.error(err.message || "Failed to load production runs");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, machineFilter, gsmFilter, searchQuery, page, pageSize]);

  React.useEffect(() => {
    fetchFilteredRuns();
  }, [fetchFilteredRuns]);

  const handleRelease = async (runId: string, runNumber: string) => {
    try {
      await releaseRunToFloor(runId);
      toast.success(`Run #${runNumber} released to floor tablet.`);
      fetchFilteredRuns();
    } catch (err: any) {
      toast.error(err.message || "Failed to release run");
    }
  };

  const handleCancel = async (runId: string, runNumber: string) => {
    try {
      await cancelProductionRun(runId, "Cancelled by planner from dashboard");
      toast.success(`Run #${runNumber} cancelled.`);
      fetchFilteredRuns();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel run");
    }
  };

  const clearAllFilters = () => {
    setStatusFilter("ALL");
    setMachineFilter("ALL");
    setGsmFilter("ALL");
    setSearchQuery("");
    setPage(1);
  };

  const hasActiveFilters =
    statusFilter !== "ALL" ||
    machineFilter !== "ALL" ||
    gsmFilter !== "ALL" ||
    searchQuery.trim() !== "";

  // Helper for Status Badge
  const renderStatusBadge = (status: RunStatus) => {
    switch (status) {
      case RunStatus.PLANNED:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
            PLANNED
          </span>
        );
      case RunStatus.RELEASED:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            RELEASED
          </span>
        );
      case RunStatus.RUNNING:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            RUNNING
          </span>
        );
      case RunStatus.COMPLETED:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            COMPLETED
          </span>
        );
      case RunStatus.CANCELLED:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  const columns: ColumnDef<ProductionRunRow>[] = [
    {
      accessorKey: "runNumber",
      header: "Run #",
      cell: ({ row }) => (
        <Link
          href={`/production/${row.original.id}`}
          className="font-mono font-bold text-sky-600 hover:text-sky-700 hover:underline flex items-center gap-1 text-xs"
        >
          {row.getValue("runNumber")}
        </Link>
      ),
    },
    {
      accessorKey: "machine",
      header: "Machine & Deckle",
      cell: ({ row }) => {
        const m = row.original.machine;
        return (
          <div>
            <div className="font-bold text-slate-900 text-xs">{m.name}</div>
            <div className="text-[11px] font-mono text-slate-400">
              Code: {m.code} • Max {Number(m.maxDeckleInch).toFixed(1)}&quot; Deckle
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "gsm",
      header: "Quality",
      cell: ({ row }) => (
        <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-mono font-bold text-[10px]">
          {row.getValue("gsm")} GSM
        </span>
      ),
    },
    {
      accessorKey: "patterns",
      header: "Patterns",
      cell: ({ row }) => (
        <span className="font-mono font-bold text-xs text-slate-900">
          {(row.original.patterns || []).length} setups
        </span>
      ),
    },
    {
      accessorKey: "totalPlannedKg",
      header: () => <div className="text-right">Planned Weight</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono font-bold text-xs text-slate-900">
          {formatWeightKg(Number(row.getValue("totalPlannedKg")))}
        </div>
      ),
    },
    {
      accessorKey: "totalTrimPercent",
      header: () => <div className="text-right">Trim Loss</div>,
      cell: ({ row }) => {
        const trim = Number(row.getValue("totalTrimPercent") || 0);
        const isOptimal = trim <= 3.0;
        return (
          <div className="text-right">
            <span
              className={`font-mono font-bold text-xs px-2 py-0.5 rounded-md ${
                isOptimal
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {trim.toFixed(2)}%
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => renderStatusBadge(row.getValue("status")),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const r = row.original;
        const canRelease = r.status === RunStatus.PLANNED && isPlannerOrAdmin;
        const canCancel =
          (r.status === RunStatus.PLANNED || r.status === RunStatus.RELEASED) &&
          isPlannerOrAdmin;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-900">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl border-slate-100 shadow-md">
              <DropdownMenuLabel className="text-xs font-bold font-mono">
                {r.runNumber}
              </DropdownMenuLabel>
              <DropdownMenuItem asChild className="text-xs gap-2">
                <Link href={`/production/${r.id}`}>
                  <Eye className="h-3.5 w-3.5 text-slate-500" /> View Run Details
                </Link>
              </DropdownMenuItem>

              {canRelease && (
                <DropdownMenuItem
                  className="text-xs gap-2 text-blue-600 font-semibold"
                  onClick={() => handleRelease(r.id, r.runNumber)}
                >
                  <Play className="h-3.5 w-3.5" /> Release to Floor Tablet
                </DropdownMenuItem>
              )}

              {canCancel && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-xs gap-2 text-rose-600 font-semibold"
                    onClick={() => handleCancel(r.id, r.runNumber)}
                  >
                    <XCircle className="h-3.5 w-3.5" /> Cancel Run
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-6 font-sans pb-10">
      {/* 1. TOP HERO BANNER */}
      <div className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-[11px] font-bold uppercase tracking-wide">
            STEP 3 • FLOOR PRODUCTION & SLITTING
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Factory className="h-7 w-7 text-amber-500" />
            Machine Production Runs
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl font-medium">
            Monitor paper machine schedules, slitter knife setups, trim loss benchmarks, and operator floor logging.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isPlannerOrAdmin && (
            <Button
              asChild
              className="h-10 px-5 rounded-xl bg-sky-400 hover:bg-sky-500 text-white font-bold text-xs gap-1.5 shadow-md shadow-sky-400/25 transition-all"
            >
              <Link href="/deckle">
                <Plus className="h-4 w-4 stroke-[2.5]" /> Plan New Run
              </Link>
            </Button>
          )}

          <Button
            asChild
            variant="outline"
            className="h-10 px-5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border-slate-200 text-xs font-bold gap-1.5 shadow-xs"
          >
            <Link href="/operator">
              <Tablet className="h-4 w-4 text-amber-500" /> Open Floor Tablet
            </Link>
          </Button>
        </div>
      </div>

      {/* 2. 4 PERFORMANCE KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. RUNS SCHEDULED TODAY */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              RUNS TODAY
            </span>
            <div className="h-8 w-8 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center">
              <Factory className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-900">
              {stats.runsToday} <span className="text-sm font-semibold text-slate-400 font-sans">Runs</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Active machine schedules
            </p>
          </div>
        </div>

        {/* 2. RUNNING NOW */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              RUNNING ON FLOOR
            </span>
            <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
              <Activity className="h-4 w-4 animate-pulse" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-emerald-700">
              {stats.runningNow} <span className="text-sm font-semibold text-slate-400 font-sans">Active</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Currently slitting reels
            </p>
          </div>
        </div>

        {/* 3. AVG TRIM (7D) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              AVG TRIM (7D)
            </span>
            <div className="h-8 w-8 rounded-xl bg-sky-50 text-sky-500 flex items-center justify-center">
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-900">
              {stats.avgTrimWeek.toFixed(2)}%
            </div>
            <p className="text-[11px] text-emerald-700 font-bold mt-1">
              {stats.avgTrimWeek <= 3.0 ? "✓ Target met (≤3%)" : "Above target"}
            </p>
          </div>
        </div>

        {/* 4. WEEKLY OUTPUT WEIGHT */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              WEEKLY OUTPUT
            </span>
            <div className="h-8 w-8 rounded-xl bg-purple-50 text-purple-500 flex items-center justify-center">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-900">
              {(stats.totalKgProducedWeek / 1000).toFixed(1)} <span className="text-sm font-semibold text-slate-400 font-sans">MT</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Reconciled production output
            </p>
          </div>
        </div>
      </div>

      {/* 3. MULTI-FILTERS BAR */}
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 shrink-0 mr-1">
            <Filter className="h-4 w-4 text-sky-500" /> Filters:
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 text-xs w-[140px] bg-slate-50/70 border-slate-200 rounded-xl">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="PLANNED">Planned</SelectItem>
              <SelectItem value="RELEASED">Released</SelectItem>
              <SelectItem value="RUNNING">Running</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          {/* Machine Filter */}
          <Select value={machineFilter} onValueChange={setMachineFilter}>
            <SelectTrigger className="h-9 text-xs w-[170px] bg-slate-50/70 border-slate-200 rounded-xl">
              <SelectValue placeholder="Machine" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="ALL">All Machines</SelectItem>
              {machinesList.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} ({m.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* GSM Filter */}
          <Select value={gsmFilter} onValueChange={setGsmFilter}>
            <SelectTrigger className="h-9 text-xs w-[120px] bg-slate-50/70 border-slate-200 rounded-xl">
              <SelectValue placeholder="GSM" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="ALL">All GSMs</SelectItem>
              <SelectItem value="120">120 GSM</SelectItem>
              <SelectItem value="140">140 GSM</SelectItem>
              <SelectItem value="150">150 GSM</SelectItem>
              <SelectItem value="180">180 GSM</SelectItem>
              <SelectItem value="220">220 GSM</SelectItem>
            </SelectContent>
          </Select>

          {/* Search Box */}
          <Input
            placeholder="Search Run #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 text-xs w-[180px] bg-slate-50/70 border-slate-200 rounded-xl"
          />

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="h-9 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl gap-1"
            >
              <X className="h-3.5 w-3.5" /> Clear Filters
            </Button>
          )}

          <span className="text-xs text-slate-400 font-mono ml-auto">
            {total} Runs Found
          </span>
        </div>
      </div>

      {/* 4. RUNS DATA TABLE */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] overflow-hidden">
        <DataTable
          columns={columns}
          data={data}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          totalRows={total}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
