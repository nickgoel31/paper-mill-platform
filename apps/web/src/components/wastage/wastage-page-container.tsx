"use client";

import * as React from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Role } from "@/generated/prisma/browser";
import {
  getWastageLogs,
  getWastageAnalytics,
} from "@/server/services/wastage-service";
import { formatWeightKg } from "@/lib/utils";
import { WastageAnalyticsView } from "./wastage-analytics-view";
import { WastageLogModal } from "./wastage-log-modal";
import {
  Scissors,
  BarChart3,
  List,
  Plus,
  Filter,
  X,
  TrendingDown,
  Factory,
} from "lucide-react";

interface WastageLogRow {
  id: string;
  wastageKg: any;
  wastageType: string;
  reason: string | null;
  recordedAt: Date | string;
  productionRun?: {
    id: string;
    runNumber: string;
    gsm: number;
    machine: { id: string; name: string; code: string };
  } | null;
  createdBy?: {
    id: string;
    name: string;
    role: string;
  } | null;
}

interface WastagePageContainerProps {
  initialLogs: {
    rows: WastageLogRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  initialAnalytics: any;
  machinesList: { id: string; name: string; code: string }[];
  productionRunsList: { id: string; runNumber: string }[];
  userRole: Role;
}

export function WastagePageContainer({
  initialLogs,
  initialAnalytics,
  machinesList,
  productionRunsList,
  userRole,
}: WastagePageContainerProps) {
  const [logs, setLogs] = React.useState(initialLogs.rows);
  const [total, setTotal] = React.useState(initialLogs.total);
  const [page, setPage] = React.useState(initialLogs.page);
  const [pageSize, setPageSize] = React.useState(initialLogs.pageSize);
  const [totalPages, setTotalPages] = React.useState(initialLogs.totalPages);
  const [analytics, setAnalytics] = React.useState(initialAnalytics);
  const [search, setSearch] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = React.useState<string>("ALL");
  const [machineFilter, setMachineFilter] = React.useState<string>("ALL");
  const [gsmFilter, setGsmFilter] = React.useState<string>("");

  // Modal
  const [logModalOpen, setLogModalOpen] = React.useState(false);

  const canWrite = userRole === Role.ADMIN || userRole === Role.PLANNER || userRole === Role.DISPATCH;

  const fetchLogs = React.useCallback(
    async (newPage: number, searchTerm: string) => {
      setIsLoading(true);
      try {
        const res = await getWastageLogs({
          page: newPage,
          pageSize,
          search: searchTerm,
          wastageType: typeFilter !== "ALL" ? typeFilter : undefined,
          machineId: machineFilter !== "ALL" ? machineFilter : undefined,
          gsm: gsmFilter ? Number(gsmFilter) : undefined,
        });

        setLogs(res.rows as any);
        setTotal(res.total);
        setPage(res.page);
        setTotalPages(res.totalPages);

        const newAnalytics = await getWastageAnalytics(30);
        setAnalytics(newAnalytics);
      } catch (err: any) {
        toast.error(err.message || "Failed to fetch wastage logs");
      } finally {
        setIsLoading(false);
      }
    },
    [pageSize, typeFilter, machineFilter, gsmFilter]
  );

  React.useEffect(() => {
    fetchLogs(1, search);
  }, [typeFilter, machineFilter, gsmFilter]);

  const columns: ColumnDef<WastageLogRow>[] = [
    {
      accessorKey: "recordedAt",
      header: "Date Recorded",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {new Date(row.getValue("recordedAt")).toLocaleDateString("en-IN")}
        </span>
      ),
    },
    {
      id: "runNumber",
      header: "Production Run",
      cell: ({ row }) => {
        const pr = row.original.productionRun;
        if (!pr) return <span className="text-muted-foreground font-mono text-xs">Floor Scrap (No Run)</span>;
        return (
          <Link
            href={`/production/${pr.id}`}
            className="font-mono font-bold text-primary hover:underline text-xs"
          >
            {pr.runNumber}
          </Link>
        );
      },
    },
    {
      id: "machine",
      header: "Machine",
      cell: ({ row }) => {
        const m = row.original.productionRun?.machine;
        return m ? (
          <span className="font-semibold text-xs text-slate-800">{m.name}</span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        );
      },
    },
    {
      id: "gsm",
      header: "GSM",
      cell: ({ row }) => {
        const g = row.original.productionRun?.gsm;
        return g ? (
          <Badge variant="outline" className="font-mono text-[10px]">
            {g} GSM
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        );
      },
    },
    {
      accessorKey: "wastageKg",
      header: () => <div className="text-right">Scrap Weight (kg)</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono font-bold text-amber-800">
          {formatWeightKg(row.getValue("wastageKg"))}
        </div>
      ),
    },
    {
      accessorKey: "wastageType",
      header: "Classification",
      cell: ({ row }) => {
        const t = row.getValue("wastageType") as string;
        const color =
          t === "TRIM"
            ? "bg-blue-100 text-blue-800 border-blue-300"
            : t === "REJECT"
            ? "bg-rose-100 text-rose-800 border-rose-300"
            : "bg-purple-100 text-purple-800 border-purple-300";
        return (
          <Badge className={`font-mono text-[10px] ${color}`}>
            {t}
          </Badge>
        );
      },
    },
    {
      accessorKey: "reason",
      header: "Reason / Notes",
      cell: ({ row }) => (
        <span className="text-xs text-slate-700 max-w-xs truncate block">
          {row.getValue("reason") || "Standard operational trim"}
        </span>
      ),
    },
    {
      id: "recordedBy",
      header: "Logged By",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.createdBy?.name || "System"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <Tabs defaultValue="analytics" className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <TabsList className="bg-slate-100 p-1 border">
            <TabsTrigger value="analytics" className="gap-2 text-xs font-semibold">
              <BarChart3 className="h-4 w-4" /> Wastage Analytics & Charts
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2 text-xs font-semibold">
              <List className="h-4 w-4" /> Wastage Log Records ({total})
            </TabsTrigger>
          </TabsList>

          {canWrite && (
            <Button
              type="button"
              size="sm"
              onClick={() => setLogModalOpen(true)}
              className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold gap-1.5 shadow-sm"
            >
              <Plus className="h-4 w-4" /> Log Floor Scrap / Wastage
            </Button>
          )}
        </div>

        {/* Tab 1: Analytics & Visual Charts */}
        <TabsContent value="analytics" className="space-y-6">
          <WastageAnalyticsView analytics={analytics} />
        </TabsContent>

        {/* Tab 2: Logs DataTable */}
        <TabsContent value="logs" className="space-y-4">
          {/* Filter Bar */}
          <Card className="p-3 bg-slate-50/70 border">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-700 flex items-center gap-1 shrink-0">
                <Filter className="h-3.5 w-3.5" /> Filters:
              </span>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-8 text-xs w-[140px] bg-white">
                  <SelectValue placeholder="Wastage Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  <SelectItem value="TRIM">Edge Trim</SelectItem>
                  <SelectItem value="REJECT">Paper Break / Reject</SelectItem>
                  <SelectItem value="OTHER">Handling Scrap</SelectItem>
                </SelectContent>
              </Select>

              <Select value={machineFilter} onValueChange={setMachineFilter}>
                <SelectTrigger className="h-8 text-xs w-[160px] bg-white">
                  <SelectValue placeholder="Machine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Machines</SelectItem>
                  {machinesList.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.code} - {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="number"
                placeholder="GSM (e.g. 120)"
                className="h-8 w-28 bg-white font-mono text-xs"
                value={gsmFilter}
                onChange={(e) => setGsmFilter(e.target.value)}
              />

              {(typeFilter !== "ALL" || machineFilter !== "ALL" || gsmFilter !== "") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => {
                    setTypeFilter("ALL");
                    setMachineFilter("ALL");
                    setGsmFilter("");
                  }}
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Reset
                </Button>
              )}
            </div>
          </Card>

          <DataTable
            columns={columns}
            data={logs}
            totalRows={total}
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            isLoading={isLoading}
            searchPlaceholder="Search run #, machine, reason..."
            searchTerm={search}
            onSearchChange={(t) => {
              setSearch(t);
              fetchLogs(1, t);
            }}
            onPageChange={(p) => fetchLogs(p, search)}
          />
        </TabsContent>
      </Tabs>

      {/* Manual Wastage Log Modal */}
      <WastageLogModal
        open={logModalOpen}
        onOpenChange={setLogModalOpen}
        productionRuns={productionRunsList}
        onSuccess={() => fetchLogs(page, search)}
      />
    </div>
  );
}
