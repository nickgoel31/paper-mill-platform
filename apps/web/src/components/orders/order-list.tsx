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
import { OrderStatus, OrderPriority, Role } from "@/generated/prisma/browser";
import { canTransition } from "@/server/services/order-service";
import {
  offlineGetOrders,
  offlineGetOrderSummaryStats,
  offlineTransitionOrderStatus,
} from "@/lib/offline/wrapped-actions";
import { OfflineEmptyState } from "@/components/shared/offline-empty-state";
import { formatWeightKg, formatCurrencyINR } from "@/lib/utils";
import {
  ShoppingCart,
  Plus,
  MoreHorizontal,
  Eye,
  Pencil,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Calendar,
  Layers,
  Filter,
  X,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Package,
} from "lucide-react";
import { WorkflowBanner } from "@/components/layout/workflow-banner";

interface ClientRef {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
}

interface OrderItemRef {
  id: string;
  widthInch: any;
  gsm: number;
  quantityKg: any;
  producedKg: any;
  dispatchedKg: any;
  ratePerKg: any;
}

interface OrderRow {
  id: string;
  orderNumber: string;
  orderDate: Date | string;
  deliveryDate: Date | string | null;
  priority: OrderPriority;
  status: OrderStatus;
  notes: string | null;
  client: ClientRef;
  items: OrderItemRef[];
}

interface OrderListProps {
  initialData: {
    rows: OrderRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  initialStats: {
    openOrdersCount: number;
    totalPendingKg: number;
    ordersDueThisWeek: number;
    overdueOrdersCount: number;
  };
  clientsList: { id: string; name: string; code: string }[];
  userRole: Role;
}

export function OrderList({
  initialData,
  initialStats,
  clientsList,
  userRole,
}: OrderListProps) {
  const [data, setData] = React.useState(initialData.rows);
  const [total, setTotal] = React.useState(initialData.total);
  const [stats, setStats] = React.useState(initialStats);
  const [page, setPage] = React.useState(initialData.page);
  const [pageSize, setPageSize] = React.useState(initialData.pageSize);
  const [totalPages, setTotalPages] = React.useState(initialData.totalPages);

  // Filters State
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = React.useState<string>("ALL");
  const [clientFilter, setClientFilter] = React.useState<string>("ALL");
  const [gsmFilter, setGsmFilter] = React.useState<string>("ALL");
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isOfflineEmpty, setIsOfflineEmpty] = React.useState(false);
  const [showingCached, setShowingCached] = React.useState(false);

  const isAdminOrSales = userRole === Role.ADMIN || userRole === Role.SALES;
  const isPlannerOrAdmin = userRole === Role.ADMIN || userRole === Role.PLANNER;

  // Fetch updated records
  const fetchFilteredOrders = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const ordersResult = await offlineGetOrders({
        status: statusFilter === "ALL" ? undefined : [statusFilter as OrderStatus],
        priority: priorityFilter === "ALL" ? undefined : [priorityFilter as OrderPriority],
        clientId: clientFilter === "ALL" ? undefined : clientFilter,
        gsm: gsmFilter === "ALL" ? undefined : Number(gsmFilter),
        search: searchQuery || undefined,
        page,
        pageSize,
      });

      if (ordersResult.empty) {
        setIsOfflineEmpty(true);
        return;
      }
      setIsOfflineEmpty(false);
      setShowingCached(ordersResult.fromCache);

      const res = ordersResult.data!;
      setData(res.rows as OrderRow[]);
      setTotal(res.total);
      setTotalPages(res.totalPages);

      const statsResult = await offlineGetOrderSummaryStats();
      if (!statsResult.empty && statsResult.data) setStats(statsResult.data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load orders");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, priorityFilter, clientFilter, gsmFilter, searchQuery, page, pageSize]);

  React.useEffect(() => {
    fetchFilteredOrders();
  }, [fetchFilteredOrders]);

  const handleStatusTransition = async (
    orderId: string,
    orderNumber: string,
    newStatus: OrderStatus
  ) => {
    try {
      const result = await offlineTransitionOrderStatus({ orderId, newStatus });
      if (result.queued) {
        toast.info(`Offline — Order #${orderNumber} status change saved locally and will sync automatically.`);
      } else {
        toast.success(`Order #${orderNumber} transitioned to ${newStatus}`);
        fetchFilteredOrders();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to transition status");
    }
  };

  const clearAllFilters = () => {
    setStatusFilter("ALL");
    setPriorityFilter("ALL");
    setClientFilter("ALL");
    setGsmFilter("ALL");
    setSearchQuery("");
    setPage(1);
  };

  const hasActiveFilters =
    statusFilter !== "ALL" ||
    priorityFilter !== "ALL" ||
    clientFilter !== "ALL" ||
    gsmFilter !== "ALL" ||
    searchQuery.trim() !== "";

  // Helper for Status Badge
  const renderStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.CONFIRMED:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            CONFIRMED
          </span>
        );
      case OrderStatus.PLANNED:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200/60">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
            PLANNED
          </span>
        );
      case OrderStatus.IN_PRODUCTION:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            IN PROD
          </span>
        );
      case OrderStatus.PRODUCED:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            PRODUCED
          </span>
        );
      case OrderStatus.DISPATCHED:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
            DISPATCHED
          </span>
        );
      case OrderStatus.CANCELLED:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
            CANCELLED
          </span>
        );
      case OrderStatus.DRAFT:
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
            DRAFT
          </span>
        );
    }
  };

  // Priority Badge Helper
  const renderPriorityBadge = (priority: OrderPriority) => {
    switch (priority) {
      case OrderPriority.URGENT:
        return (
          <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
            URGENT
          </span>
        );
      case OrderPriority.STOCK:
        return (
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
            STOCK
          </span>
        );
      case OrderPriority.NORMAL:
      default:
        return (
          <span className="text-[10px] uppercase font-semibold text-slate-500">
            NORMAL
          </span>
        );
    }
  };

  // Columns definition
  const columns: ColumnDef<OrderRow>[] = [
    {
      accessorKey: "orderNumber",
      header: "Order No.",
      cell: ({ row }) => (
        <Link
          href={`/orders/${row.original.id}`}
          className="font-mono font-bold text-sky-600 hover:text-sky-700 hover:underline flex items-center gap-1"
        >
          {row.getValue("orderNumber")}
        </Link>
      ),
    },
    {
      accessorKey: "client",
      header: "Client & Destination",
      cell: ({ row }) => {
        const c = row.original.client;
        return (
          <div>
            <div className="font-bold text-slate-900 text-xs">{c.name}</div>
            <div className="text-[11px] font-mono text-slate-400">
              {c.code} • {c.city}, {c.state}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "orderDate",
      header: "Order Date",
      cell: ({ row }) => (
        <span className="text-xs text-slate-500 font-mono">
          {new Date(row.getValue("orderDate")).toLocaleDateString("en-IN")}
        </span>
      ),
    },
    {
      accessorKey: "deliveryDate",
      header: "Delivery Due",
      cell: ({ row }) => {
        const d = row.original.deliveryDate ? new Date(row.original.deliveryDate) : null;
        if (!d) return <span className="text-slate-400 text-xs">—</span>;

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const isPast = d < now && row.original.status !== OrderStatus.DISPATCHED;
        const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 3600 * 24));

        return (
          <div className="flex flex-col">
            <span
              className={`text-xs font-mono font-bold ${
                isPast
                  ? "text-rose-600"
                  : diffDays <= 3 && row.original.status !== OrderStatus.DISPATCHED
                  ? "text-amber-600"
                  : "text-slate-700"
              }`}
            >
              {d.toLocaleDateString("en-IN")}
            </span>
            {isPast ? (
              <span className="text-[10px] text-rose-600 font-bold">
                Overdue by {Math.abs(diffDays)}d
              </span>
            ) : diffDays <= 3 && row.original.status !== OrderStatus.DISPATCHED ? (
              <span className="text-[10px] text-amber-600 font-medium">Due in {diffDays}d</span>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: "items",
      header: "Items & Widths",
      cell: ({ row }) => {
        const items = row.original.items || [];
        const distinctGsms = Array.from(new Set(items.map((it) => it.gsm)));
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-900 font-mono">
              {items.length} sizes
            </span>
            <div className="flex items-center gap-1">
              {distinctGsms.map((gsm) => (
                <span
                  key={gsm}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold"
                >
                  {gsm}G
                </span>
              ))}
            </div>
          </div>
        );
      },
    },
    {
      id: "totalWeight",
      header: () => <div className="text-right">Planned Weight</div>,
      cell: ({ row }) => {
        const items = row.original.items || [];
        const totalKg = items.reduce(
          (acc, it) => acc + Number(it.quantityKg || 0),
          0
        );
        return (
          <div className="text-right font-mono font-bold text-xs text-slate-900">
            {formatWeightKg(totalKg)}
          </div>
        );
      },
    },
    {
      accessorKey: "priority",
      header: "Priority",
      cell: ({ row }) => renderPriorityBadge(row.getValue("priority")),
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
        const canCancel =
          item.status === OrderStatus.CONFIRMED ||
          item.status === OrderStatus.DRAFT ||
          item.status === OrderStatus.PLANNED;
        const canConfirm = item.status === OrderStatus.DRAFT;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-900">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl border-slate-100 shadow-md">
              <DropdownMenuLabel className="text-xs font-bold font-mono">
                {item.orderNumber}
              </DropdownMenuLabel>
              <DropdownMenuItem asChild className="text-xs gap-2">
                <Link href={`/orders/${item.id}`}>
                  <Eye className="h-3.5 w-3.5 text-slate-500" /> View Order Details
                </Link>
              </DropdownMenuItem>

              {isAdminOrSales &&
                (item.status === OrderStatus.DRAFT ||
                  item.status === OrderStatus.CONFIRMED) && (
                  <DropdownMenuItem asChild className="text-xs gap-2">
                    <Link href={`/orders/${item.id}/edit`}>
                      <Pencil className="h-3.5 w-3.5 text-slate-500" /> Edit Order
                    </Link>
                  </DropdownMenuItem>
                )}

              {canConfirm && isAdminOrSales && (
                <DropdownMenuItem
                  className="text-xs gap-2 text-emerald-600 font-semibold"
                  onClick={() =>
                    handleStatusTransition(
                      item.id,
                      item.orderNumber,
                      OrderStatus.CONFIRMED
                    )
                  }
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Confirm Order
                </DropdownMenuItem>
              )}

              {canCancel && isAdminOrSales && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-xs gap-2 text-rose-600 font-semibold"
                    onClick={() =>
                      handleStatusTransition(
                        item.id,
                        item.orderNumber,
                        OrderStatus.CANCELLED
                      )
                    }
                  >
                    <XCircle className="h-3.5 w-3.5" /> Cancel Order
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
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-[11px] font-bold uppercase tracking-wide">
            STEP 1 • COMMERCIAL DEMAND INTAKE
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <ShoppingCart className="h-7 w-7 text-sky-500" />
            Sales Orders Management
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl font-medium">
            Book customer purchase orders, manage reel width sizes, GSM grades, quantities, and ±5% tolerances for deckle optimization.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isAdminOrSales && (
            <Button
              asChild
              className="h-10 px-5 rounded-xl bg-sky-400 hover:bg-sky-500 text-white font-bold text-xs gap-1.5 shadow-md shadow-sky-400/25 transition-all"
            >
              <Link href="/orders/new">
                <Plus className="h-4 w-4 stroke-[2.5]" /> Book New Order
              </Link>
            </Button>
          )}

          {isPlannerOrAdmin && (
            <Button
              asChild
              variant="outline"
              className="h-10 px-5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border-slate-200 text-xs font-bold gap-1.5 shadow-xs"
            >
              <Link href="/deckle">
                <Sparkles className="h-4 w-4 text-purple-500" /> Optimize in Deckle Planner
              </Link>
            </Button>
          )}
        </div>
      </div>

      {isOfflineEmpty && <OfflineEmptyState label="Orders haven't been loaded on this device yet." />}

      {showingCached && !isOfflineEmpty && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
          You&apos;re offline — showing the last data loaded on this device. New orders and status
          changes you make now will sync automatically once you&apos;re back online.
        </div>
      )}

      {/* 2. 4 PERFORMANCE KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. OPEN ORDERS */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              OPEN ORDERS
            </span>
            <div className="h-8 w-8 rounded-xl bg-sky-50 text-sky-500 flex items-center justify-center">
              <ShoppingCart className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-900">
              {stats.openOrdersCount}
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Draft, Confirmed & In Production
            </p>
          </div>
        </div>

        {/* 2. TOTAL PENDING BACKLOG */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              TOTAL DEMAND
            </span>
            <div className="h-8 w-8 rounded-xl bg-purple-50 text-purple-500 flex items-center justify-center">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-900">
              {(stats.totalPendingKg / 1000).toFixed(2)} <span className="text-sm font-semibold text-slate-400 font-sans">MT</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              {stats.totalPendingKg.toLocaleString("en-IN")} kg remaining
            </p>
          </div>
        </div>

        {/* 3. DUE THIS WEEK */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              DUE THIS WEEK
            </span>
            <div className="h-8 w-8 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-900">
              {stats.ordersDueThisWeek} <span className="text-sm font-semibold text-slate-400 font-sans">Orders</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Target dispatch in next 7 days
            </p>
          </div>
        </div>

        {/* 4. OVERDUE ORDERS */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              OVERDUE
            </span>
            <div className="h-8 w-8 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-rose-600">
              {stats.overdueOrdersCount} <span className="text-sm font-semibold text-slate-400 font-sans">Orders</span>
            </div>
            <p className="text-[11px] text-rose-600 font-medium mt-1">
              Passed promised delivery date
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
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="CONFIRMED">Confirmed</SelectItem>
              <SelectItem value="PLANNED">Planned</SelectItem>
              <SelectItem value="IN_PRODUCTION">In Production</SelectItem>
              <SelectItem value="PRODUCED">Produced</SelectItem>
              <SelectItem value="DISPATCHED">Dispatched</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          {/* Priority Filter */}
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="h-9 text-xs w-[130px] bg-slate-50/70 border-slate-200 rounded-xl">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="ALL">All Priorities</SelectItem>
              <SelectItem value="URGENT">Urgent</SelectItem>
              <SelectItem value="NORMAL">Normal</SelectItem>
              <SelectItem value="STOCK">Stock</SelectItem>
            </SelectContent>
          </Select>

          {/* Client Filter */}
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="h-9 text-xs w-[180px] bg-slate-50/70 border-slate-200 rounded-xl">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent className="rounded-xl max-h-64">
              <SelectItem value="ALL">All Clients</SelectItem>
              {clientsList.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.code} - {c.name}
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
            placeholder="Search Order # or Notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 text-xs w-[200px] bg-slate-50/70 border-slate-200 rounded-xl"
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
            {total} Orders Found
          </span>
        </div>
      </div>

      {/* 4. ORDERS DATA TABLE */}
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
