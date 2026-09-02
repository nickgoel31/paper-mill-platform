"use client";

import * as React from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
import { LoadStatus, Role } from "@prisma/client";
import {
  getLoadBatches,
  markBatchPlanned,
  cancelLoadBatch,
} from "@/server/services/load-batch-service";
import { formatWeightKg } from "@/lib/utils";
import {
  Truck,
  Plus,
  MoreHorizontal,
  Eye,
  CheckCircle2,
  XCircle,
  Filter,
  X,
  Building,
} from "lucide-react";

interface TruckRef {
  id: string;
  registrationNumber: string;
  capacityKg: number;
}

interface TransporterRef {
  id: string;
  name: string;
  phone: string;
}

interface LoadBatchRow {
  id: string;
  batchNumber: string;
  status: LoadStatus;
  plannedDispatchDate: Date | string | null;
  totalPlannedKg: any;
  driverName: string | null;
  driverPhone: string | null;
  notes: string | null;
  truck: TruckRef | null;
  transporter: TransporterRef | null;
  orders: {
    id: string;
    order: {
      id: string;
      orderNumber: string;
      client: { id: string; name: string; city: string };
      items: { quantityKg: any }[];
    };
  }[];
}

interface LoadListProps {
  initialData: {
    rows: LoadBatchRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  trucksList: { id: string; registrationNumber: string; capacityKg: number }[];
  transportersList: { id: string; name: string }[];
  userRole: Role;
}

export function LoadList({
  initialData,
  trucksList,
  transportersList,
  userRole,
}: LoadListProps) {
  const [data, setData] = React.useState(initialData.rows);
  const [total, setTotal] = React.useState(initialData.total);
  const [page, setPage] = React.useState(initialData.page);
  const [pageSize, setPageSize] = React.useState(initialData.pageSize);
  const [totalPages, setTotalPages] = React.useState(initialData.totalPages);
  const [search, setSearch] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [truckFilter, setTruckFilter] = React.useState<string>("ALL");
  const [transporterFilter, setTransporterFilter] = React.useState<string>("ALL");

  const canManage =
    userRole === Role.ADMIN || userRole === Role.PLANNER || userRole === Role.SALES;

  const fetchData = React.useCallback(
    async (newPage: number, searchTerm: string) => {
      setIsLoading(true);
      try {
        const res = await getLoadBatches({
          page: newPage,
          pageSize,
          search: searchTerm,
          status: statusFilter !== "ALL" ? (statusFilter as LoadStatus) : undefined,
          truckId: truckFilter !== "ALL" ? truckFilter : undefined,
          transporterId: transporterFilter !== "ALL" ? transporterFilter : undefined,
        });

        setData(res.rows as any);
        setTotal(res.total);
        setPage(res.page);
        setTotalPages(res.totalPages);
      } catch (err: any) {
        toast.error(err.message || "Failed to fetch load batches");
      } finally {
        setIsLoading(false);
      }
    },
    [pageSize, statusFilter, truckFilter, transporterFilter]
  );

  React.useEffect(() => {
    fetchData(1, search);
  }, [statusFilter, truckFilter, transporterFilter]);

  const handleMarkPlanned = async (batchId: string) => {
    try {
      await markBatchPlanned(batchId);
      toast.success("Load batch marked as PLANNED. All assigned orders are now PLANNED.");
      fetchData(page, search);
    } catch (err: any) {
      toast.error(err.message || "Failed to mark batch as planned");
    }
  };

  const handleCancelBatch = async (batchId: string) => {
    try {
      await cancelLoadBatch(batchId);
      toast.success("Load batch cancelled. All assigned orders reverted to CONFIRMED.");
      fetchData(page, search);
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel batch");
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (status: LoadStatus) => {
    switch (status) {
      case LoadStatus.DRAFT:
        return <Badge variant="outline" className="font-mono text-[10px]">DRAFT</Badge>;
      case LoadStatus.PLANNED:
        return <Badge className="font-mono text-[10px] bg-blue-100 text-blue-800 border-blue-300">PLANNED</Badge>;
      case LoadStatus.LOADING:
        return <Badge className="font-mono text-[10px] bg-amber-100 text-amber-800 border-amber-300 animate-pulse">LOADING</Badge>;
      case LoadStatus.DISPATCHED:
        return <Badge className="font-mono text-[10px] bg-emerald-100 text-emerald-800 border-emerald-300">DISPATCHED</Badge>;
      case LoadStatus.DELIVERED:
        return <Badge className="font-mono text-[10px] bg-slate-900 text-white">DELIVERED</Badge>;
      case LoadStatus.CANCELLED:
        return <Badge variant="destructive" className="font-mono text-[10px]">CANCELLED</Badge>;
    }
  };

  // Columns definition
  const columns: ColumnDef<LoadBatchRow>[] = [
    {
      accessorKey: "batchNumber",
      header: "Batch No.",
      cell: ({ row }) => (
        <Link
          href={`/loads/${row.original.id}`}
          className="font-mono font-bold text-primary hover:underline"
        >
          {row.getValue("batchNumber")}
        </Link>
      ),
    },
    {
      id: "truck",
      header: "Truck",
      cell: ({ row }) => {
        const tr = row.original.truck;
        return tr ? (
          <div>
            <span className="font-mono font-bold text-xs bg-slate-100 px-1.5 py-0.5 rounded border">
              {tr.registrationNumber}
            </span>
            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
              Cap: {formatWeightKg(tr.capacityKg)}
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground text-xs italic">Unassigned</span>
        );
      },
    },
    {
      id: "transporter",
      header: "Transporter",
      cell: ({ row }) => (
        <span className="text-xs font-medium">
          {row.original.transporter?.name || "Direct / Self"}
        </span>
      ),
    },
    {
      id: "orderCount",
      header: () => <div className="text-right">Orders</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-xs font-semibold">
          {row.original.orders.length} orders
        </div>
      ),
    },
    {
      accessorKey: "totalPlannedKg",
      header: () => <div className="text-right">Total Planned Weight</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono font-bold text-slate-900">
          {formatWeightKg(row.getValue("totalPlannedKg"))}
        </div>
      ),
    },
    {
      id: "utilisation",
      header: () => <div className="text-right">Capacity Utilisation</div>,
      cell: ({ row }) => {
        const planned = Number(row.original.totalPlannedKg) || 0;
        const cap = row.original.truck?.capacityKg || 0;
        if (cap === 0) return <div className="text-right text-muted-foreground text-xs">—</div>;

        const pct = Math.round((planned / cap) * 100);

        // Colour the utilisation cell: red < 70%, amber 70–90%, green > 90%
        let badgeStyle = "bg-red-100 text-red-800 border-red-300";
        if (pct >= 90) {
          badgeStyle = "bg-emerald-100 text-emerald-800 border-emerald-300";
        } else if (pct >= 70) {
          badgeStyle = "bg-amber-100 text-amber-800 border-amber-300";
        }

        return (
          <div className="text-right">
            <span className={`text-xs px-2 py-0.5 rounded font-mono font-bold border ${badgeStyle}`}>
              {pct}%
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "plannedDispatchDate",
      header: "Planned Date",
      cell: ({ row }) => {
        const d = row.getValue("plannedDispatchDate") as string | null;
        return (
          <span className="font-mono text-xs text-muted-foreground">
            {d ? new Date(d).toLocaleDateString("en-IN") : "—"}
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
      header: "Actions",
      cell: ({ row }) => {
        const b = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">Batch #{b.batchNumber}</DropdownMenuLabel>
              <DropdownMenuItem asChild className="text-xs gap-2">
                <Link href={`/loads/${b.id}`}>
                  <Eye className="h-3.5 w-3.5" /> View Details & WhatsApp
                </Link>
              </DropdownMenuItem>

              {b.status === LoadStatus.DRAFT && canManage && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleMarkPlanned(b.id)}
                    className="text-xs gap-2 text-blue-700 font-semibold"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark Planned
                  </DropdownMenuItem>
                </>
              )}

              {b.status !== LoadStatus.DISPATCHED &&
                b.status !== LoadStatus.DELIVERED &&
                b.status !== LoadStatus.CANCELLED &&
                canManage && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleCancelBatch(b.id)}
                      className="text-xs gap-2 text-destructive"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Cancel Batch
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
    <div className="space-y-4">
      {/* Filters Bar */}
      <Card className="p-3 bg-slate-50/70 border">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-700 flex items-center gap-1 shrink-0">
            <Filter className="h-3.5 w-3.5" /> Filters:
          </span>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs w-[140px] bg-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="PLANNED">Planned</SelectItem>
              <SelectItem value="LOADING">Loading</SelectItem>
              <SelectItem value="DISPATCHED">Dispatched</SelectItem>
              <SelectItem value="DELIVERED">Delivered</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select value={truckFilter} onValueChange={setTruckFilter}>
            <SelectTrigger className="h-8 text-xs w-[160px] bg-white">
              <SelectValue placeholder="Truck" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Trucks</SelectItem>
              {trucksList.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.registrationNumber} ({(t.capacityKg / 1000).toFixed(0)} MT)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={transporterFilter} onValueChange={setTransporterFilter}>
            <SelectTrigger className="h-8 text-xs w-[180px] bg-white">
              <SelectValue placeholder="Transporter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Transporters</SelectItem>
              {transportersList.map((tr) => (
                <SelectItem key={tr.id} value={tr.id}>
                  {tr.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(statusFilter !== "ALL" || truckFilter !== "ALL" || transporterFilter !== "ALL") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => {
                setStatusFilter("ALL");
                setTruckFilter("ALL");
                setTransporterFilter("ALL");
              }}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Reset
            </Button>
          )}
        </div>
      </Card>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={data}
        totalRows={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        isLoading={isLoading}
        searchPlaceholder="Search batch number, truck, driver, transporter..."
        searchTerm={search}
        onSearchChange={(t) => {
          setSearch(t);
          fetchData(1, t);
        }}
        onPageChange={(p) => fetchData(p, search)}
        actionButton={
          canManage ? (
            <Button asChild size="sm" className="gap-1.5 shadow-sm">
              <Link href="/loads/new">
                <Plus className="h-4 w-4" /> Build Truck Load Batch
              </Link>
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
