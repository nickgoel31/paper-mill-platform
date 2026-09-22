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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { StockStatus, Role, PaperType, PaperSize } from "@/generated/prisma/browser";
import { PAPER_TYPE_LABELS, PAPER_TYPES } from "@/lib/paper-type";
import { PAPER_SIZE_LABELS, PAPER_SIZES } from "@/lib/paper-size";
import {
  getStockItems,
  getStockSummaryStats,
  getStockDateSummary,
  getStockItemsForExport,
  deallocateStock,
  allocateStockToOrderItem,
  allocateStockToOriginOrders,
  importStockItemsCsv,
  deleteStockItem,
  deleteStockItems,
} from "@/server/services/stock-service";
import { formatWeightKg, formatWidthInch } from "@/lib/utils";
import { objectsToCsv, downloadCsv } from "@/lib/csv";
import { StockAllocationModal } from "./stock-allocation-modal";
import { StockAdjustModal } from "./stock-adjust-modal";
import { CsvImportDialog } from "@/components/shared/csv-import-dialog";
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
  Upload,
  Download,
  CalendarDays,
  Loader2,
  Trash2,
} from "lucide-react";

interface StockItemRow {
  id: string;
  reelNumber?: string | null;
  widthInch: any;
  gsm: number;
  paperType: PaperType;
  size: PaperSize;
  quantityKg: any;
  status: StockStatus;
  location: string | null;
  remarks?: string | null;
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
  displayUnit?: "INCH" | "CM";
}

export function StockList({ initialData, initialStats, userRole, displayUnit = "INCH" }: StockListProps) {
  const [data, setData] = React.useState(initialData.rows);
  const [total, setTotal] = React.useState(initialData.total);
  const [page, setPage] = React.useState(initialData.page);
  const [pageSize, setPageSize] = React.useState(initialData.pageSize);
  const [totalPages, setTotalPages] = React.useState(initialData.totalPages);
  const [stats, setStats] = React.useState(initialStats);

  // Filters
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [gsmFilter, setGsmFilter] = React.useState<string>("ALL");
  const [paperTypeFilter, setPaperTypeFilter] = React.useState<string>("ALL");
  const [sizeFilter, setSizeFilter] = React.useState<string>("ALL");
  const [locationFilter, setLocationFilter] = React.useState<string>("ALL");
  const [dateFrom, setDateFrom] = React.useState<string>("");
  const [dateTo, setDateTo] = React.useState<string>("");
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);

  // Opening/closing stock-as-of-date panel
  const [asOfDate, setAsOfDate] = React.useState<string>("");
  const [dateSummary, setDateSummary] = React.useState<Awaited<ReturnType<typeof getStockDateSummary>> | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = React.useState(false);

  // Modals state
  const [allocateItem, setAllocateItem] = React.useState<StockItemRow | null>(null);
  const [adjustItem, setAdjustItem] = React.useState<StockItemRow | null>(null);
  const [isCreatingStock, setIsCreatingStock] = React.useState(false);
  const [csvImportOpen, setCsvImportOpen] = React.useState(false);

  const isPlannerOrAdmin = userRole === Role.ADMIN || userRole === Role.PLANNER;
  const isAdmin = userRole === Role.ADMIN;
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = React.useState<{ mode: "single" | "bulk" | "all"; id?: string } | null>(null);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = React.useState("");
  const [isDeleting, setIsDeleting] = React.useState(false);

  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSelectAllOnPage = () =>
    setSelectedIds((prev) => {
      const pageIds = data.map((r) => r.id);
      const allSelected = pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      pageIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.mode === "single" && deleteTarget.id) {
        await deleteStockItem(deleteTarget.id);
        toast.success("Stock item deleted.");
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(deleteTarget.id!);
          return next;
        });
      } else if (deleteTarget.mode === "bulk") {
        const res = await deleteStockItems(Array.from(selectedIds));
        toast.success(`${res.deleted} item(s) deleted.`);
        if (res.skipped.length > 0) {
          toast.warning(`${res.skipped.length} item(s) skipped: ${res.skipped.map((s) => s.reason).slice(0, 1)}`);
        }
        setSelectedIds(new Set());
      } else {
        // "all" — every item matching the current filters, across all pages
        const allRows = await getStockItemsForExport(currentFilterParams());
        const res = await deleteStockItems(allRows.map((r: any) => r.id));
        toast.success(`${res.deleted} item(s) deleted.`);
        if (res.skipped.length > 0) {
          toast.warning(`${res.skipped.length} item(s) skipped (allocated/dispatched reels aren't deletable).`);
        }
        setSelectedIds(new Set());
        setDeleteAllConfirmText("");
      }
      setDeleteTarget(null);
      fetchFilteredStock();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    } finally {
      setIsDeleting(false);
    }
  };

  const currentFilterParams = React.useCallback(
    () => ({
      status: statusFilter === "ALL" ? undefined : (statusFilter as StockStatus),
      gsm: gsmFilter === "ALL" ? undefined : Number(gsmFilter),
      paperType: paperTypeFilter === "ALL" ? undefined : (paperTypeFilter as PaperType),
      size: sizeFilter === "ALL" ? undefined : (sizeFilter as PaperSize),
      location: locationFilter === "ALL" ? undefined : locationFilter,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      search: searchQuery || undefined,
    }),
    [statusFilter, gsmFilter, paperTypeFilter, sizeFilter, locationFilter, dateFrom, dateTo, searchQuery]
  );

  const fetchFilteredStock = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getStockItems({ ...currentFilterParams(), page, pageSize });

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
  }, [currentFilterParams, page, pageSize]);

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
    setPaperTypeFilter("ALL");
    setSizeFilter("ALL");
    setLocationFilter("ALL");
    setDateFrom("");
    setDateTo("");
    setSearchQuery("");
    setPage(1);
  };

  const hasActiveFilters =
    statusFilter !== "ALL" ||
    gsmFilter !== "ALL" ||
    paperTypeFilter !== "ALL" ||
    sizeFilter !== "ALL" ||
    locationFilter !== "ALL" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    searchQuery.trim() !== "";

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const rawRows = await getStockItemsForExport(currentFilterParams());
      if (rawRows.length === 0) {
        toast.warning("No stock items match the current filters.");
        return;
      }
      const exportRows = (rawRows as any[]).map((r) => ({
        reelNumber: r.reelNumber || "",
        widthInch: Number(r.widthInch),
        gsm: r.gsm,
        paperType: r.paperType,
        size: r.size,
        quantityKg: Number(r.quantityKg),
        status: r.status,
        location: r.location || "",
        remarks: r.remarks || "",
        allocatedOrderNumber: r.orderItem?.order?.orderNumber || "",
        createdAt: new Date(r.createdAt).toISOString().slice(0, 10),
      }));
      const csv = objectsToCsv(exportRows, [
        { key: "reelNumber", header: "reelNumber" },
        { key: "widthInch", header: "widthInch" },
        { key: "gsm", header: "gsm" },
        { key: "paperType", header: "paperType" },
        { key: "size", header: "size" },
        { key: "quantityKg", header: "quantityKg" },
        { key: "status", header: "status" },
        { key: "location", header: "location" },
        { key: "remarks", header: "remarks" },
        { key: "allocatedOrderNumber", header: "allocatedOrderNumber" },
        { key: "createdAt", header: "createdAt" },
      ]);
      downloadCsv(`stock-export-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast.success(`Exported ${exportRows.length} stock item(s) to CSV.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to export stock to CSV");
    } finally {
      setIsExporting(false);
    }
  };

  const handleViewDateSummary = async () => {
    if (!asOfDate) {
      toast.warning("Pick a date first.");
      return;
    }
    setIsLoadingSummary(true);
    try {
      const summary = await getStockDateSummary(asOfDate);
      setDateSummary(summary);
    } catch (err: any) {
      toast.error(err.message || "Failed to compute opening/closing stock");
    } finally {
      setIsLoadingSummary(false);
    }
  };

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
    ...(isAdmin
      ? [
          {
            id: "select",
            header: () => (
              <Checkbox
                checked={data.length > 0 && data.every((r) => selectedIds.has(r.id))}
                onCheckedChange={() => toggleSelectAllOnPage()}
                aria-label="Select all on this page"
              />
            ),
            cell: ({ row }: any) => (
              <Checkbox
                checked={selectedIds.has(row.original.id)}
                onCheckedChange={() => toggleSelected(row.original.id)}
                aria-label="Select row"
              />
            ),
          } as ColumnDef<StockItemRow>,
        ]
      : []),
    {
      accessorKey: "reelNumber",
      header: "Reel No.",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-600">
          {row.original.reelNumber || "—"}
        </span>
      ),
    },
    {
      accessorKey: "widthInch",
      header: "Width (Inches)",
      cell: ({ row }) => (
        <span className="font-mono font-black text-slate-900 text-sm">
          {formatWidthInch(row.getValue("widthInch"), displayUnit)}
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
      accessorKey: "paperType",
      header: "Paper Type",
      cell: ({ row }) => (
        <span className="text-xs font-semibold text-slate-700">
          {PAPER_TYPE_LABELS[row.original.paperType] ?? row.original.paperType}
        </span>
      ),
    },
    {
      accessorKey: "size",
      header: "Size",
      cell: ({ row }) => (
        <span className="text-xs font-semibold text-slate-700">
          {PAPER_SIZE_LABELS[row.original.size] ?? row.original.size ?? "Normal"}
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
      accessorKey: "remarks",
      header: "Remarks",
      cell: ({ row }) => (
        <span className="text-xs text-slate-500 truncate max-w-[180px] inline-block align-middle">
          {row.original.remarks || "—"}
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
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-xs gap-2 text-rose-600 font-semibold"
                    onClick={() => setDeleteTarget({ mode: "single", id: item.id })}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
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
            <>
              <Button
                variant="outline"
                onClick={() => setCsvImportOpen(true)}
                className="h-10 px-4 rounded-full border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs gap-1.5"
              >
                <Upload className="h-4 w-4" /> Import CSV
              </Button>
              <Button
                asChild
                className="h-10 px-5 rounded-full bg-[#161622] hover:bg-[#202030] text-white font-bold text-xs gap-1.5 shadow-sm transition-all"
              >
                <Link href="/stock/new">
                  <Plus className="h-4 w-4 text-[#d4f842]" /> Add Stock Item
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      <CsvImportDialog
        open={csvImportOpen}
        onOpenChange={setCsvImportOpen}
        title="Import Stock Reels from CSV"
        description="One row per reel. Leave reelNumber blank to auto-generate one."
        requiredColumns={["widthInch", "gsm", "quantityKg"]}
        optionalColumns={[
          "reelNumber",
          "widthUnit (INCH/CM)",
          "paperType (NATURAL/BY)",
          "size (BABY/NORMAL)",
          "location",
          "remarks",
          "orderNumber (allocates to that order's matching line)",
        ]}
        onImport={importStockItemsCsv}
        onDone={fetchFilteredStock}
      />

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

          <Select value={paperTypeFilter} onValueChange={setPaperTypeFilter}>
            <SelectTrigger className="h-9 text-xs w-[150px] bg-slate-50/70 border-slate-200 rounded-xl">
              <SelectValue placeholder="Paper type" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="ALL">All Paper Types</SelectItem>
              {PAPER_TYPES.map((pt) => (
                <SelectItem key={pt} value={pt}>
                  {PAPER_TYPE_LABELS[pt]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sizeFilter} onValueChange={setSizeFilter}>
            <SelectTrigger className="h-9 text-xs w-[130px] bg-slate-50/70 border-slate-200 rounded-xl">
              <SelectValue placeholder="Size" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="ALL">All Sizes</SelectItem>
              {PAPER_SIZES.map((sz) => (
                <SelectItem key={sz} value={sz}>
                  {PAPER_SIZE_LABELS[sz]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-semibold text-slate-500">From</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 text-xs w-[145px] bg-slate-50/70 border-slate-200 rounded-xl"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-semibold text-slate-500">To</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 text-xs w-[145px] bg-slate-50/70 border-slate-200 rounded-xl"
            />
          </div>

          <Input
            placeholder="Search Reel No., Bay, Order #..."
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

          <Button
            variant="outline"
            size="sm"
            disabled={isExporting}
            onClick={handleExportCsv}
            className="h-9 text-xs text-slate-700 border-slate-200 hover:bg-slate-50 rounded-xl gap-1.5 font-bold"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Export CSV
          </Button>

          {isAdmin && selectedIds.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteTarget({ mode: "bulk" })}
              className="h-9 text-xs text-rose-600 border-rose-200 hover:bg-rose-50 rounded-xl gap-1.5 font-bold"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete Selected ({selectedIds.size})
            </Button>
          )}

          {isAdmin && total > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteTarget({ mode: "all" })}
              className="h-9 text-xs text-rose-700 border-rose-300 bg-rose-50 hover:bg-rose-100 rounded-xl gap-1.5 font-bold"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete All ({total}{hasActiveFilters ? " matching filters" : ""})
            </Button>
          )}

          <span className="text-xs text-slate-400 font-mono ml-auto">
            {total} Stock Items Found
          </span>
        </div>
      </div>

      {/* 3.5 OPENING / CLOSING STOCK FOR A DAY */}
      <div className="rounded-[20px] bg-white border border-slate-100 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 shrink-0 mr-1">
            <CalendarDays className="h-4 w-4 text-sky-500" /> Opening / Closing Stock:
          </div>
          <Input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="h-9 text-xs w-[160px] bg-slate-50/70 border-slate-200 rounded-xl"
          />
          <Button
            size="sm"
            disabled={isLoadingSummary}
            onClick={handleViewDateSummary}
            className="h-9 text-xs bg-[#161622] hover:bg-[#202030] text-white font-bold rounded-xl gap-1.5"
          >
            {isLoadingSummary ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            View
          </Button>

          {dateSummary && (
            <div className="flex flex-wrap items-center gap-4 ml-2 text-xs">
              <span>
                <span className="text-slate-400 font-medium">Opening: </span>
                <span className="font-mono font-bold text-slate-900">
                  {formatWeightKg(dateSummary.openingStockKg)}
                </span>{" "}
                <span className="text-slate-400">({dateSummary.openingCount} reels)</span>
              </span>
              <span>
                <span className="text-slate-400 font-medium">Inward: </span>
                <span className="font-mono font-bold text-emerald-600">
                  +{formatWeightKg(dateSummary.inwardKg)}
                </span>
              </span>
              <span>
                <span className="text-slate-400 font-medium">Dispatched: </span>
                <span className="font-mono font-bold text-rose-600">
                  -{formatWeightKg(dateSummary.dispatchedKg)}
                </span>
              </span>
              <span>
                <span className="text-slate-400 font-medium">Closing: </span>
                <span className="font-mono font-bold text-slate-900">
                  {formatWeightKg(dateSummary.closingStockKg)}
                </span>{" "}
                <span className="text-slate-400">({dateSummary.closingCount} reels)</span>
              </span>
            </div>
          )}
        </div>
        <p className="text-[10px] text-slate-400 mt-2">
          Based on each reel's inward date and current status — a reel manually quantity-adjusted after this date is counted at its adjusted quantity.
        </p>
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

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setDeleteAllConfirmText("");
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-600">
              {deleteTarget?.mode === "all"
                ? `Delete ALL ${total} Stock Item(s)?`
                : deleteTarget?.mode === "bulk"
                ? `Delete ${selectedIds.size} Stock Item(s)?`
                : "Delete Stock Item?"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {deleteTarget?.mode === "all"
                ? `This permanently removes every stock item currently matching your filters (${total} item(s)) from inventory. Only AVAILABLE reels are actually deletable — allocated or dispatched ones will be skipped. This cannot be undone.`
                : "This permanently removes the reel(s) from inventory. Only AVAILABLE reels can be deleted — allocated or dispatched ones will be skipped. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          {deleteTarget?.mode === "all" && (
            <div className="space-y-1.5 py-1">
              <label className="text-xs font-semibold text-slate-700">
                Type <span className="font-mono font-bold">DELETE ALL</span> to confirm
              </label>
              <Input
                value={deleteAllConfirmText}
                onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                placeholder="DELETE ALL"
                className="h-9 text-xs font-mono"
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteAllConfirmText("");
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={isDeleting || (deleteTarget?.mode === "all" && deleteAllConfirmText !== "DELETE ALL")}
              className="gap-1.5"
            >
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
