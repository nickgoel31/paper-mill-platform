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
import { StockStatus, Role } from "@/generated/prisma/browser";
import {
  getStockItems,
  getStockSummaryStats,
  deallocateStock,
  allocateStockToOrderItem,
  allocateStockToOriginOrders,
} from "@/server/services/stock-service";
import { formatWeightKg, formatWidthInch } from "@/lib/utils";
import { StockAllocationModal } from "./stock-allocation-modal";
import { StockAdjustModal } from "./stock-adjust-modal";
import {
  Layers,
  MoreHorizontal,
  Link2,
  Unlink2,
  Edit,
  Plus,
  Filter,
  X,
  Clock,
  Warehouse,
  Boxes,
  Sparkles,
  Package,
  CheckCircle2,
} from "lucide-react";

interface StockItemRow {
  id: string;
  widthInch: any;
  gsm: number;
  quantityKg: any;
  status: StockStatus;
  location: string | null;
  createdAt: Date | string;
  productionRun?: {
    id: string;
    runNumber: string;
    machine: { name: string; code: string };
  } | null;
  /** The order this reel was cut for (set when it was stored to inventory instead of allocated). */
  originOrder?: {
    orderItemId: string;
    orderNumber: string;
    clientName: string;
  } | null;
  orderItem?: {
    id: string;
    widthInch: any;
    gsm: number;
    quantityKg: any;
    producedKg: any;
    order: {
      id: string;
      orderNumber: string;
      client: { name: string; code: string; city: string };
    };
  } | null;
}

interface StockListProps {
  initialData: {
    rows: StockItemRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  initialStats: {
    totalAvailableKg: number;
    totalAllocatedKg: number;
    availableCount: number;
    allocatedCount: number;
    distinctSkusCount: number;
    oldestStockDays: number;
  };
  userRole: Role;
}

export function StockList({ initialData, initialStats, userRole }: StockListProps) {
  const [data, setData] = React.useState(initialData.rows);
  const [total, setTotal] = React.useState(initialData.total);
  const [page, setPage] = React.useState(initialData.page);
  const [pageSize, setPageSize] = React.useState(initialData.pageSize);
  const [totalPages, setTotalPages] = React.useState(initialData.totalPages);
  const [stats, setStats] = React.useState(initialStats);

  // Filters
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [gsmFilter, setGsmFilter] = React.useState<string>("ALL");
  const [locationFilter, setLocationFilter] = React.useState<string>("ALL");
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState(false);

  // Modals state
  const [allocateItem, setAllocateItem] = React.useState<StockItemRow | null>(null);
  const [adjustItem, setAdjustItem] = React.useState<StockItemRow | null>(null);
  const [isCreatingStock, setIsCreatingStock] = React.useState(false);

  const isPlannerOrAdmin = userRole === Role.ADMIN || userRole === Role.PLANNER;

  const fetchFilteredStock = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getStockItems({
        status: statusFilter === "ALL" ? undefined : (statusFilter as StockStatus),
        gsm: gsmFilter === "ALL" ? undefined : Number(gsmFilter),
        location: locationFilter === "ALL" ? undefined : locationFilter,
        search: searchQuery || undefined,
        page,
        pageSize,
      });

      const st = await getStockSummaryStats();
      setData(res.rows as StockItemRow[]);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setStats(st);
    } catch (err: any) {
      toast.error(err.message || "Failed to load warehouse stock");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, gsmFilter, locationFilter, searchQuery, page, pageSize]);

  React.useEffect(() => {
    fetchFilteredStock();
  }, [fetchFilteredStock]);

  const handleDeallocate = async (stockItemId: string) => {
    try {
      await deallocateStock(stockItemId);
      toast.success("Stock unallocated and returned to available inventory.");
      fetchFilteredStock();
    } catch (err: any) {
      toast.error(err.message || "Failed to deallocate stock");
    }
  };

  const handleMatchToOrigin = async (item: StockItemRow) => {
    if (!item.originOrder) return;
    try {
      await allocateStockToOrderItem(item.id, item.originOrder.orderItemId);
      toast.success(`Reel allocated to ${item.originOrder.orderNumber}.`);
      fetchFilteredStock();
    } catch (err: any) {
      toast.error(err.message || "Failed to allocate stock");
    }
  };

  const [isMatchingAll, setIsMatchingAll] = React.useState(false);
  const handleMatchAll = async () => {
    setIsMatchingAll(true);
    try {
      const { allocated, skipped } = await allocateStockToOriginOrders();
      if (allocated === 0 && skipped === 0) {
        toast.info("No inventory reels are waiting for their original order.");
      } else {
        toast.success(
          `Allocated ${allocated} reel${allocated === 1 ? "" : "s"} to their orders` +
            (skipped ? ` (${skipped} skipped — order no longer eligible).` : ".")
        );
      }
      fetchFilteredStock();
    } catch (err: any) {
      toast.error(err.message || "Failed to match reels");
    } finally {
      setIsMatchingAll(false);
    }
  };

  const clearAllFilters = () => {
    setStatusFilter("ALL");
    setGsmFilter("ALL");
    setLocationFilter("ALL");
    setSearchQuery("");
    setPage(1);
  };

  const hasActiveFilters =
    statusFilter !== "ALL" ||
    gsmFilter !== "ALL" ||
    locationFilter !== "ALL" ||
    searchQuery.trim() !== "";

  const renderStatusBadge = (status: StockStatus) => {
    switch (status) {
      case StockStatus.AVAILABLE:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            AVAILABLE
          </span>
        );
      case StockStatus.ALLOCATED:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            ALLOCATED
          </span>
        );
      case StockStatus.DISPATCHED:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            DISPATCHED
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

  const columns: ColumnDef<StockItemRow>[] = [
    {
      accessorKey: "widthInch",
      header: "Width (Inches)",
      cell: ({ row }) => (
        <span className="font-mono font-black text-slate-900 text-sm">
          {formatWidthInch(row.getValue("widthInch"))}
        </span>
      ),
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
      accessorKey: "quantityKg",
      header: () => <div className="text-right">Weight (KG)</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono font-bold text-xs text-slate-900">
          {formatWeightKg(Number(row.getValue("quantityKg")))}
        </div>
      ),
    },
    {
      accessorKey: "location",
      header: "Warehouse Bay",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
          {row.getValue("location") || "Bay-General"}
        </span>
      ),
    },
    {
      accessorKey: "orderItem",
      header: "Allocation Demand",
      cell: ({ row }) => {
        const oi = row.original.orderItem;
        const origin = row.original.originOrder;
        if (!oi && origin && row.original.status === StockStatus.AVAILABLE) {
          return (
            <div>
              <div className="font-mono font-bold text-amber-600 text-xs">
                Cut for {origin.orderNumber}
              </div>
              <div className="text-[11px] text-slate-400">
                {origin.clientName} · awaiting match
              </div>
            </div>
          );
        }
        if (!oi) return <span className="text-slate-400 text-xs italic">Unallocated Buffer</span>;
        return (
          <div>
            <div className="font-mono font-bold text-sky-600 text-xs">
              {oi.order.orderNumber}
            </div>
            <div className="text-[11px] text-slate-400">
              {oi.order.client.name}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "productionRun",
      header: "Source Machine Run",
      cell: ({ row }) => {
        const pr = row.original.productionRun;
        if (!pr) return <span className="text-slate-400 text-xs italic">Manual Inward</span>;
        return (
          <span className="font-mono text-xs text-slate-700">
            {pr.runNumber} ({pr.machine.code})
          </span>
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
        const item = row.original;
        const isAvailable = item.status === StockStatus.AVAILABLE;
        const isAllocated = item.status === StockStatus.ALLOCATED;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-900">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl border-slate-100 shadow-md">
              <DropdownMenuLabel className="text-xs font-bold font-mono">
                Stock Item
              </DropdownMenuLabel>
              {isAvailable && isPlannerOrAdmin && item.originOrder && (
                <DropdownMenuItem
                  className="text-xs gap-2 text-emerald-700 font-semibold"
                  onClick={() => handleMatchToOrigin(item)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Allocate to {item.originOrder.orderNumber}
                </DropdownMenuItem>
              )}
              {isAvailable && isPlannerOrAdmin && (
                <DropdownMenuItem
                  className="text-xs gap-2 text-sky-600 font-semibold"
                  onClick={() => setAllocateItem(item)}
                >
                  <Link2 className="h-3.5 w-3.5" /> Allocate to Order
                </DropdownMenuItem>
              )}
              {isAllocated && isPlannerOrAdmin && (
                <DropdownMenuItem
                  className="text-xs gap-2 text-amber-700 font-semibold"
                  onClick={() => handleDeallocate(item.id)}
                >
                  <Unlink2 className="h-3.5 w-3.5" /> Deallocate from Order
                </DropdownMenuItem>
              )}
              {isPlannerOrAdmin && (
                <DropdownMenuItem
                  className="text-xs gap-2"
                  onClick={() => setAdjustItem(item)}
                >
                  <Edit className="h-3.5 w-3.5 text-slate-500" /> Adjust Quantity / Bay
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
      <div className="bg-white rounded-[26px] p-6 sm:p-7 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-[11px] font-bold uppercase tracking-wide">
            INVENTORY • FINISHED GOODS & BUFFER STOCK
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Warehouse className="h-7 w-7 text-sky-500" />
            Finished Goods Warehouse
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl font-medium">
            Track available paper reels, allocated customer inventory, bay locations, and manual stock inward adjustments.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {isPlannerOrAdmin && stats.availableCount > 0 && (
            <Button
              type="button"
              variant="outline"
              disabled={isMatchingAll}
              onClick={handleMatchAll}
              className="h-10 px-5 rounded-full font-bold text-xs gap-1.5"
            >
              <Link2 className="h-4 w-4" />
              {isMatchingAll ? "Matching..." : "Match reels to their orders"}
            </Button>
          )}
          {isPlannerOrAdmin && (
            <Button
              asChild
              className="h-10 px-5 rounded-full bg-[#161622] hover:bg-[#202030] text-white font-bold text-xs gap-1.5 shadow-sm transition-all"
            >
              <Link href="/stock/new">
                <Plus className="h-4 w-4 text-[#d4f842]" /> Add Stock Item
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* 2. 4 PERFORMANCE KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* 1. AVAILABLE STOCK (Hero Dark Card) */}
        <div className="relative overflow-hidden rounded-[26px] bg-[#161622] text-white p-6 shadow-xl flex flex-col justify-between min-h-[160px]">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#d4f842]/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Available Stock</span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#d4f842] text-black text-[11px] font-bold shadow-sm">
              <span>Ready</span>
              <Boxes className="h-3 w-3" />
            </div>
          </div>
          <div className="space-y-1 mt-3">
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight">
              {(stats.totalAvailableKg / 1000).toFixed(1)}{" "}
              <span className="text-sm font-semibold text-slate-400 font-sans">MT</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              {stats.availableCount} unallocated reels ready for shipment
            </p>
          </div>
        </div>

        {/* 2. ALLOCATED STOCK */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Allocated Stock</span>
            <div className="h-8 w-8 rounded-full bg-sky-50 text-sky-500 flex items-center justify-center">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <div className="space-y-1 mt-3">
            <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 tracking-tight">
              {(stats.totalAllocatedKg / 1000).toFixed(1)}{" "}
              <span className="text-sm font-semibold text-slate-400 font-sans">MT</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              {stats.allocatedCount} reels assigned to orders
            </p>
          </div>
        </div>

        {/* 3. DISTINCT SKUS */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Distinct Sizes</span>
            <div className="h-8 w-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="space-y-1 mt-3">
            <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 tracking-tight">
              {stats.distinctSkusCount}{" "}
              <span className="text-sm font-semibold text-slate-400 font-sans">SKUs</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Width & GSM combinations
            </p>
          </div>
        </div>

        {/* 4. OLDEST STOCK AGE */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Oldest Batch</span>
            <div className="h-8 w-8 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="space-y-1 mt-3">
            <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 tracking-tight">
              {stats.oldestStockDays}{" "}
              <span className="text-sm font-semibold text-slate-400 font-sans">Days</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Max aging in warehouse
            </p>
          </div>
        </div>
      </div>

      {/* 3. MULTI-FILTERS BAR */}
      <div className="rounded-[20px] bg-white border border-slate-100 p-4 shadow-sm">
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
              <SelectItem value="AVAILABLE">Available</SelectItem>
              <SelectItem value="ALLOCATED">Allocated</SelectItem>
              <SelectItem value="DISPATCHED">Dispatched</SelectItem>
            </SelectContent>
          </Select>

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

          <Input
            placeholder="Search Width, Bay, Order #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 text-xs w-[220px] bg-slate-50/70 border-slate-200 rounded-xl"
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
            {total} Stock Items Found
          </span>
        </div>
      </div>

      {/* 4. STOCK DATA TABLE */}
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

      {/* Allocation Modal */}
      {allocateItem && (
        <StockAllocationModal
          open={!!allocateItem}
          onOpenChange={(isOpen) => {
            if (!isOpen) setAllocateItem(null);
          }}
          stockItem={allocateItem as any}
          onSuccess={() => {
            setAllocateItem(null);
            fetchFilteredStock();
          }}
        />
      )}

      {/* Adjust / Create Modal */}
      {(adjustItem || isCreatingStock) && (
        <StockAdjustModal
          open={!!adjustItem || isCreatingStock}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setAdjustItem(null);
              setIsCreatingStock(false);
            }
          }}
          stockItem={adjustItem as any}
          onSuccess={() => {
            setAdjustItem(null);
            setIsCreatingStock(false);
            fetchFilteredStock();
          }}
        />
      )}
    </div>
  );
}
