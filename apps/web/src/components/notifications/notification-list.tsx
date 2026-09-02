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
import { NotificationStatus } from "@/generated/prisma/browser";
import {
  getNotifications,
  getNotificationSummaryStats,
  processNotificationQueue,
  retryNotification,
} from "@/server/services/notification-service";
import { NotificationPreviewModal } from "./notification-preview-modal";
import {
  MessageSquare,
  Send,
  RefreshCw,
  MoreHorizontal,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Filter,
  X,
  Play,
  Loader2,
  Eye,
  Sparkles,
  TrendingUp,
} from "lucide-react";

interface NotificationRow {
  id: string;
  phoneNumber: string;
  templateName: string;
  payload: any;
  status: NotificationStatus;
  providerMessageId: string | null;
  errorMessage: string | null;
  attempts: number;
  sentAt: Date | string | null;
  createdAt: Date | string;
  client: {
    id: string;
    name: string;
    city: string;
    phone: string;
  };
  loadBatch?: {
    id: string;
    batchNumber: string;
  } | null;
}

interface NotificationListProps {
  initialData: {
    rows: NotificationRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  initialStats: {
    sentToday: number;
    queuedCount: number;
    failedCount: number;
    successRate: number;
  };
}

export function NotificationList({
  initialData,
  initialStats,
}: NotificationListProps) {
  const [data, setData] = React.useState(initialData.rows);
  const [total, setTotal] = React.useState(initialData.total);
  const [page, setPage] = React.useState(initialData.page);
  const [pageSize, setPageSize] = React.useState(initialData.pageSize);
  const [totalPages, setTotalPages] = React.useState(initialData.totalPages);
  const [stats, setStats] = React.useState(initialStats);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isFlushingQueue, setIsFlushingQueue] = React.useState(false);
  const [previewNotification, setPreviewNotification] =
    React.useState<NotificationRow | null>(null);

  const fetchData = React.useCallback(
    async (newPage: number, searchTerm: string) => {
      setIsLoading(true);
      try {
        const res = await getNotifications({
          page: newPage,
          pageSize,
          search: searchTerm || undefined,
          status:
            statusFilter === "ALL"
              ? undefined
              : (statusFilter as NotificationStatus),
        });
        const st = await getNotificationSummaryStats();
        setData(res.rows as NotificationRow[]);
        setTotal(res.total);
        setTotalPages(res.totalPages);
        setStats(st);
      } catch (err: any) {
        toast.error(err.message || "Failed to load notifications");
      } finally {
        setIsLoading(false);
      }
    },
    [pageSize, statusFilter]
  );

  React.useEffect(() => {
    fetchData(page, search);
  }, [fetchData, page, search]);

  const handleFlushQueue = async () => {
    setIsFlushingQueue(true);
    try {
      const res = await processNotificationQueue(25);
      toast.success(
        `Processed outbox queue: ${res.successCount} sent, ${res.failedCount} failed.`
      );
      fetchData(1, search);
    } catch (err: any) {
      toast.error(err.message || "Failed to process outbox queue");
    } finally {
      setIsFlushingQueue(false);
    }
  };

  const handleRetry = async (notificationId: string) => {
    try {
      await retryNotification(notificationId);
      toast.success("Notification retried successfully.");
      fetchData(page, search);
    } catch (err: any) {
      toast.error(err.message || "Failed to retry notification");
    }
  };

  const renderStatusBadge = (status: NotificationStatus) => {
    switch (status) {
      case NotificationStatus.SENT:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            SENT
          </span>
        );
      case NotificationStatus.FAILED:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="h-3 w-3" /> FAILED
          </span>
        );
      case NotificationStatus.QUEUED:
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="h-3 w-3 animate-pulse" /> QUEUED
          </span>
        );
    }
  };

  const columns: ColumnDef<NotificationRow>[] = [
    {
      accessorKey: "client",
      header: "Customer & Destination",
      cell: ({ row }) => {
        const c = row.original.client;
        return (
          <div>
            <div className="font-bold text-slate-900 text-xs">{c.name}</div>
            <div className="text-[11px] font-mono text-slate-400">
              {c.city} • {row.original.phoneNumber}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "templateName",
      header: "Event Template",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
          {row.getValue("templateName")}
        </span>
      ),
    },
    {
      accessorKey: "loadBatch",
      header: "Dispatch Batch",
      cell: ({ row }) => {
        const lb = row.original.loadBatch;
        if (!lb) return <span className="text-slate-400 text-xs">—</span>;
        return (
          <Link
            href={`/dispatch/${lb.id}`}
            className="font-mono font-bold text-sky-600 hover:underline text-xs"
          >
            {lb.batchNumber}
          </Link>
        );
      },
    },
    {
      accessorKey: "attempts",
      header: "Attempts",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-600">
          {row.getValue("attempts")} / 3
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created / Sent",
      cell: ({ row }) => (
        <span className="text-xs text-slate-500 font-mono">
          {new Date(row.getValue("createdAt")).toLocaleString("en-IN")}
        </span>
      ),
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
        const item = row.original;
        const isFailed = item.status === NotificationStatus.FAILED;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-900">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl border-slate-100 shadow-md">
              <DropdownMenuLabel className="text-xs font-bold font-mono">
                WhatsApp Outbox
              </DropdownMenuLabel>
              <DropdownMenuItem
                className="text-xs gap-2"
                onClick={() => setPreviewNotification(item)}
              >
                <Eye className="h-3.5 w-3.5 text-slate-500" /> Preview Message Body
              </DropdownMenuItem>
              {isFailed && (
                <DropdownMenuItem
                  className="text-xs gap-2 text-sky-600 font-semibold"
                  onClick={() => handleRetry(item.id)}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Retry Immediate Send
                </DropdownMenuItem>
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
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold uppercase tracking-wide">
            AUTOMATION • WHATSAPP CLOUD API & DRY-RUN
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <MessageSquare className="h-7 w-7 text-emerald-500" />
            WhatsApp Notification Center
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl font-medium">
            Monitor real-time client WhatsApp order confirmations, dispatch departure alerts, and automated PDF invoice delivery.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            onClick={handleFlushQueue}
            disabled={isFlushingQueue}
            className="h-10 px-5 rounded-xl bg-sky-400 hover:bg-sky-500 text-white font-bold text-xs gap-1.5 shadow-md shadow-sky-400/25 transition-all"
          >
            {isFlushingQueue ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Flushing Outbox...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 stroke-[2.5]" /> Flush Queued Messages
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 2. 4 PERFORMANCE KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. SENT TODAY */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              SENT TODAY
            </span>
            <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
              <Send className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-emerald-700">
              {stats.sentToday} <span className="text-sm font-semibold text-slate-400 font-sans">Msgs</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Delivered successfully
            </p>
          </div>
        </div>

        {/* 2. QUEUED OUTBOX */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              QUEUED OUTBOX
            </span>
            <div className="h-8 w-8 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-900">
              {stats.queuedCount} <span className="text-sm font-semibold text-slate-400 font-sans">Pending</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Waiting for next cron tick
            </p>
          </div>
        </div>

        {/* 3. FAILED */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              FAILED ALERTS
            </span>
            <div className="h-8 w-8 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-rose-600">
              {stats.failedCount} <span className="text-sm font-semibold text-slate-400 font-sans">Failed</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Eligible for retry
            </p>
          </div>
        </div>

        {/* 4. SUCCESS RATE */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              DELIVERY RATE
            </span>
            <div className="h-8 w-8 rounded-xl bg-sky-50 text-sky-500 flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-900">
              {stats.successRate.toFixed(1)}%
            </div>
            <p className="text-[11px] text-emerald-700 font-bold mt-1">
              ✓ High delivery SLA
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

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 text-xs w-[140px] bg-slate-50/70 border-slate-200 rounded-xl">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="QUEUED">Queued</SelectItem>
              <SelectItem value="SENT">Sent</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="Search Client, Phone #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 text-xs w-[220px] bg-slate-50/70 border-slate-200 rounded-xl"
          />

          {search && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearch("")}
              className="h-9 text-xs text-rose-600 hover:bg-rose-50 rounded-xl"
            >
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}

          <span className="text-xs text-slate-400 font-mono ml-auto">
            {total} Messages in Outbox
          </span>
        </div>
      </div>

      {/* 4. NOTIFICATIONS DATA TABLE */}
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

      {/* Preview Modal */}
      {previewNotification && (
        <NotificationPreviewModal
          open={!!previewNotification}
          onOpenChange={(isOpen) => {
            if (!isOpen) setPreviewNotification(null);
          }}
          notification={previewNotification}
        />
      )}
    </div>
  );
}
