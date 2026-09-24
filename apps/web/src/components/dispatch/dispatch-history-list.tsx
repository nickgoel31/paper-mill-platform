"use client";

import * as React from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  getDispatchHistory,
  getDispatchHistoryForExport,
  markDispatchDelivered,
} from "@/server/services/dispatch-service";
import { createInvoicesFromDispatch } from "@/server/services/invoice-service";
import { formatWeightKg } from "@/lib/utils";
import { objectsToCsv, downloadCsv } from "@/lib/csv";
import {
  Truck,
  FileText,
  Receipt,
  CheckCircle2,
  MoreHorizontal,
  ArrowLeft,
  Filter,
  X,
  Printer,
  Calendar,
  Download,
  Loader2,
} from "lucide-react";

interface DispatchRow {
  id: string;
  dispatchNumber: string;
  gatePassNumber: string | null;
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
  totalDispatchedKg: any;
  dispatchedAt: Date | string;
  loadBatch: {
    id: string;
    batchNumber: string;
    status: string;
    deliveredAt: Date | string | null;
    truck?: { registrationNumber: string } | null;
    transporter?: { name: string } | null;
    orders: Array<{
      order: {
        id: string;
        orderNumber: string;
        client: { id: string; name: string; city: string; phone: string };
      };
    }>;
  };
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    totalAmount: any;
    status: string;
  }>;
  createdBy?: { name: string } | null;
}

interface DispatchHistoryListProps {
  initialData: {
    rows: DispatchRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export function DispatchHistoryList({ initialData }: DispatchHistoryListProps) {
  const [data, setData] = React.useState(initialData.rows);
  const [total, setTotal] = React.useState(initialData.total);
  const [page, setPage] = React.useState(initialData.page);
  const [pageSize, setPageSize] = React.useState(initialData.pageSize);
  const [totalPages, setTotalPages] = React.useState(initialData.totalPages);
  const [search, setSearch] = React.useState("");
  const [vehicleFilter, setVehicleFilter] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);

  const fetchData = React.useCallback(
    async (newPage: number, searchTerm: string) => {
      setIsLoading(true);
      try {
        const res = await getDispatchHistory({
          page: newPage,
          pageSize,
          search: searchTerm,
          vehicleNumber: vehicleFilter || undefined,
        });

        setData(res.rows as any);
        setTotal(res.total);
        setPage(res.page);
        setTotalPages(res.totalPages);
      } catch (err: any) {
        toast.error(err.message || "Failed to fetch dispatch history");
      } finally {
        setIsLoading(false);
      }
    },
    [pageSize, vehicleFilter]
  );

  React.useEffect(() => {
    fetchData(1, search);
  }, [vehicleFilter]);

  const handleGenerateInvoices = async (dispatchId: string) => {
    try {
      const invoices = await createInvoicesFromDispatch(dispatchId);
      toast.success(
        `Generated ${invoices.length} GST Invoices successfully!`
      );
      fetchData(page, search);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate invoices");
    }
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const rawRows = await getDispatchHistoryForExport({
        search: search || undefined,
        vehicleNumber: vehicleFilter || undefined,
      });
      if (rawRows.length === 0) {
        toast.warning("No dispatches match the current filters.");
        return;
      }
      const exportRows = (rawRows as any[]).map((d) => {
        const clients = Array.from(new Set(d.loadBatch.orders.map((o: any) => o.order.client.name)));
        const orderNumbers = Array.from(new Set(d.loadBatch.orders.map((o: any) => o.order.orderNumber)));
        return {
          date: new Date(d.dispatchedAt).toISOString().slice(0, 10),
          dispatchDocNo: d.dispatchNumber,
          buyer: clients.join(" / "),
          voucherNo: d.voucherNumber || "",
          termsOfPayment: d.termsOfPayment || "",
          termsOfDelivery: d.termsOfDelivery || "",
          consignee: d.consigneeName || "",
          consigneeAddress: d.consigneeAddress || "",
          dispatchThrough: d.dispatchThrough || "",
          destination: d.destination || "",
          vesselFlightNo: d.vesselFlightNo || "",
          gatePassNumber: d.gatePassNumber || "",
          vehicleNumber: d.vehicleNumber,
          driverName: d.driverName,
          driverPhone: d.driverPhone,
          batchNumber: d.loadBatch.batchNumber,
          orderNumbers: orderNumbers.join(" / "),
          totalDispatchedKg: Number(d.totalDispatchedKg),
          deliveryStatus: d.loadBatch.status,
        };
      });
      const csv = objectsToCsv(exportRows, [
        { key: "date", header: "Date" },
        { key: "buyer", header: "Buyer" },
        { key: "consignee", header: "Consignee" },
        { key: "consigneeAddress", header: "Consignee Address" },
        { key: "voucherNo", header: "Voucher No." },
        { key: "termsOfPayment", header: "Terms of Payment" },
        { key: "driverPhone", header: "Mobile Number" },
        { key: "termsOfDelivery", header: "Terms of Delivery" },
        { key: "dispatchDocNo", header: "Dispatch Doc. No" },
        { key: "dispatchThrough", header: "Dispatch Through" },
        { key: "destination", header: "Destination" },
        { key: "vesselFlightNo", header: "Vessel/Flight No." },
        { key: "gatePassNumber", header: "gatePassNumber" },
        { key: "vehicleNumber", header: "vehicleNumber" },
        { key: "driverName", header: "driverName" },
        { key: "batchNumber", header: "batchNumber" },
        { key: "orderNumbers", header: "orderNumbers" },
        { key: "totalDispatchedKg", header: "totalDispatchedKg" },
        { key: "deliveryStatus", header: "deliveryStatus" },
      ]);
      downloadCsv(`dispatch-export-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast.success(`Exported ${exportRows.length} dispatch(es) to CSV.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to export dispatch history to CSV");
    } finally {
      setIsExporting(false);
    }
  };

  const handleMarkDelivered = async (dispatchId: string) => {
    try {
      const result = await markDispatchDelivered(dispatchId);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Marked as DELIVERED and delivery WhatsApp notifications enqueued.");
      fetchData(page, search);
    } catch (err: any) {
      toast.error(err.message || "Failed to mark delivered");
    }
  };

  const columns: ColumnDef<DispatchRow>[] = [
    {
      accessorKey: "dispatchNumber",
      header: "Dispatch / Gate Pass",
      cell: ({ row }) => (
        <div>
          <span className="font-mono font-bold text-primary block text-xs">
            {row.getValue("dispatchNumber")}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            GP: {row.original.gatePassNumber || "—"}
          </span>
        </div>
      ),
    },
    {
      id: "loadBatch",
      header: "Load Batch",
      cell: ({ row }) => (
        <Link
          href={`/dispatch/${row.original.loadBatch.id}`}
          className="font-mono font-bold text-xs text-slate-800 hover:text-primary hover:underline"
        >
          {row.original.loadBatch.batchNumber}
        </Link>
      ),
    },
    {
      accessorKey: "vehicleNumber",
      header: "Vehicle & Driver",
      cell: ({ row }) => (
        <div>
          <span className="font-mono font-bold text-xs text-slate-900 block">
            {row.getValue("vehicleNumber")}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {row.original.driverName} ({row.original.driverPhone})
          </span>
        </div>
      ),
    },
    {
      id: "clients",
      header: "Clients Served",
      cell: ({ row }) => {
        const clients = Array.from(
          new Set(row.original.loadBatch.orders.map((o) => o.order.client.name))
        );
        return (
          <div className="text-xs font-semibold text-slate-800">
            {clients.join(", ")}
          </div>
        );
      },
    },
    {
      accessorKey: "totalDispatchedKg",
      header: () => <div className="text-right">Total Weight</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono font-bold text-slate-900 text-xs">
          {formatWeightKg(row.getValue("totalDispatchedKg"))}
        </div>
      ),
    },
    {
      id: "status",
      header: "Delivery Status",
      cell: ({ row }) => {
        const b = row.original.loadBatch;
        return b.status === "DELIVERED" ? (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-mono text-[10px]">
            DELIVERED
          </Badge>
        ) : (
          <Badge className="bg-blue-100 text-blue-800 border-blue-300 font-mono text-[10px]">
            IN TRANSIT
          </Badge>
        );
      },
    },
    {
      id: "invoicesCount",
      header: "Invoices",
      cell: ({ row }) => {
        const invs = row.original.invoices;
        if (invs.length === 0) {
          return (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGenerateInvoices(row.original.id)}
              className="h-7 text-[11px] font-bold text-primary gap-1"
            >
              <Receipt className="h-3 w-3" /> Generate Invoices
            </Button>
          );
        }
        return (
          <div className="space-y-0.5">
            {invs.map((inv) => (
              <Link
                key={inv.id}
                href={`/invoices/${inv.id}`}
                className="font-mono text-[11px] text-primary font-bold hover:underline block"
              >
                {inv.invoiceNumber}
              </Link>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "dispatchedAt",
      header: "Dispatched Date",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {new Date(row.getValue("dispatchedAt")).toLocaleDateString("en-IN")}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const item = row.original;
        const isDelivered = item.loadBatch.status === "DELIVERED";

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">
                {item.dispatchNumber}
              </DropdownMenuLabel>
              <DropdownMenuItem asChild className="text-xs gap-2">
                <Link href={`/dispatch/${item.loadBatch.id}`}>
                  <Printer className="h-3.5 w-3.5" /> View / Reprint Loading Sheet
                </Link>
              </DropdownMenuItem>
              {item.invoices.length === 0 && (
                <DropdownMenuItem
                  onClick={() => handleGenerateInvoices(item.id)}
                  className="text-xs gap-2 text-primary font-semibold"
                >
                  <Receipt className="h-3.5 w-3.5" /> 1-Click Generate Invoices
                </DropdownMenuItem>
              )}
              {!isDelivered && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleMarkDelivered(item.id)}
                    className="text-xs gap-2 text-emerald-700 font-semibold"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark Delivered (WhatsApp Alert)
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-lg border shadow-sm">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dispatch">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Dispatch Desk
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold font-mono text-slate-900 flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              Dispatch History & Gate Passes
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Historical record of all mill gate passes, dispatches, and delivery status tracking.
            </p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-3 bg-slate-50/70 border">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-700 flex items-center gap-1 shrink-0">
            <Filter className="h-3.5 w-3.5" /> Filters:
          </span>

          <Input
            placeholder="Vehicle No. (e.g. RJ-14)"
            className="h-8 w-36 bg-white font-mono text-xs uppercase"
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
          />

          {vehicleFilter !== "" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => setVehicleFilter("")}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Reset
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            disabled={isExporting}
            onClick={handleExportCsv}
            className="h-8 text-xs font-bold gap-1.5 ml-auto"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Export CSV
          </Button>
        </div>
      </Card>

      <DataTable
        columns={columns}
        data={data}
        totalRows={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        isLoading={isLoading}
        searchPlaceholder="Search dispatch #, gate pass, vehicle, driver..."
        searchTerm={search}
        onSearchChange={(t) => {
          setSearch(t);
          fetchData(1, t);
        }}
        onPageChange={(p) => fetchData(p, search)}
      />
    </div>
  );
}
