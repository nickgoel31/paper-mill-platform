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
import { InvoiceStatus } from "@prisma/client";
import { getInvoices, getInvoiceSummaryStats } from "@/server/services/invoice-service";
import { formatCurrencyINR, formatWeightKg } from "@/lib/utils";
import {
  Receipt,
  Download,
  Printer,
  MoreHorizontal,
  FileText,
  Building,
  TrendingUp,
  Filter,
  X,
  CreditCard,
  CheckCircle2,
  FileCheck,
  ReceiptText,
} from "lucide-react";
import { WorkflowBanner } from "@/components/layout/workflow-banner";

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date | string;
  subtotal: any;
  cgst: any;
  sgst: any;
  igst: any;
  totalAmount: any;
  status: InvoiceStatus;
  pdfUrl: string | null;
  client: {
    id: string;
    name: string;
    code: string;
    city: string;
    gstin: string | null;
  };
  dispatch?: {
    dispatchNumber: string;
    vehicleNumber: string;
  } | null;
}

interface InvoiceListProps {
  initialData: {
    rows: InvoiceRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  initialStats: {
    invoicedThisMonth: number;
    totalInvoicesCount: number;
    avgInvoiceValue: number;
  };
}

export function InvoiceList({ initialData, initialStats }: InvoiceListProps) {
  const [data, setData] = React.useState(initialData.rows);
  const [total, setTotal] = React.useState(initialData.total);
  const [page, setPage] = React.useState(initialData.page);
  const [pageSize, setPageSize] = React.useState(initialData.pageSize);
  const [totalPages, setTotalPages] = React.useState(initialData.totalPages);
  const [stats, setStats] = React.useState(initialStats);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [isLoading, setIsLoading] = React.useState(false);

  const fetchData = React.useCallback(
    async (newPage: number, searchTerm: string) => {
      setIsLoading(true);
      try {
        const res = await getInvoices({
          page: newPage,
          pageSize,
          search: searchTerm || undefined,
          status: statusFilter === "ALL" ? undefined : (statusFilter as InvoiceStatus),
        });
        const st = await getInvoiceSummaryStats();
        setData(res.rows as InvoiceRow[]);
        setTotal(res.total);
        setTotalPages(res.totalPages);
        setStats(st);
      } catch (err: any) {
        toast.error(err.message || "Failed to load invoices");
      } finally {
        setIsLoading(false);
      }
    },
    [pageSize, statusFilter]
  );

  React.useEffect(() => {
    fetchData(page, search);
  }, [fetchData, page, search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchData(1, search);
  };

  const renderStatusBadge = (status: InvoiceStatus) => {
    switch (status) {
      case InvoiceStatus.ISSUED:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            ISSUED
          </span>
        );
      case InvoiceStatus.CANCELLED:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
            CANCELLED
          </span>
        );
      case InvoiceStatus.DRAFT:
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            DRAFT
          </span>
        );
    }
  };

  const columns: ColumnDef<InvoiceRow>[] = [
    {
      accessorKey: "invoiceNumber",
      header: "Invoice No.",
      cell: ({ row }) => (
        <Link
          href={`/invoices/${row.original.id}`}
          className="font-mono font-bold text-sky-600 hover:text-sky-700 hover:underline flex items-center gap-1 text-xs"
        >
          {row.getValue("invoiceNumber")}
        </Link>
      ),
    },
    {
      accessorKey: "client",
      header: "Customer & Destination",
      cell: ({ row }) => {
        const c = row.original.client;
        return (
          <div>
            <div className="font-bold text-slate-900 text-xs">{c.name}</div>
            <div className="text-[11px] font-mono text-slate-400">
              GST: {c.gstin || "Unregistered"} • {c.city}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "invoiceDate",
      header: "Invoice Date",
      cell: ({ row }) => (
        <span className="text-xs text-slate-500 font-mono">
          {new Date(row.getValue("invoiceDate")).toLocaleDateString("en-IN")}
        </span>
      ),
    },
    {
      accessorKey: "subtotal",
      header: () => <div className="text-right">Taxable Value</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono font-bold text-xs text-slate-900">
          {formatCurrencyINR(Number(row.getValue("subtotal")))}
        </div>
      ),
    },
    {
      id: "taxes",
      header: () => <div className="text-right">GST Total</div>,
      cell: ({ row }) => {
        const cgst = Number(row.original.cgst || 0);
        const sgst = Number(row.original.sgst || 0);
        const igst = Number(row.original.igst || 0);
        const totalTax = cgst + sgst + igst;
        return (
          <div className="text-right font-mono text-xs text-slate-600">
            {formatCurrencyINR(totalTax)}
          </div>
        );
      },
    },
    {
      accessorKey: "totalAmount",
      header: () => <div className="text-right">Grand Total</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono font-black text-xs text-slate-900">
          {formatCurrencyINR(Number(row.getValue("totalAmount")))}
        </div>
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
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-900">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl border-slate-100 shadow-md">
              <DropdownMenuLabel className="text-xs font-bold font-mono">
                {item.invoiceNumber}
              </DropdownMenuLabel>
              <DropdownMenuItem asChild className="text-xs gap-2">
                <Link href={`/invoices/${item.id}`}>
                  <FileText className="h-3.5 w-3.5 text-slate-500" /> View Invoice
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs gap-2"
                onClick={() => {
                  window.open(`/invoices/${item.id}`, "_blank");
                }}
              >
                <Printer className="h-3.5 w-3.5 text-slate-500" /> Print Tax Invoice
              </DropdownMenuItem>
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
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold uppercase tracking-wide">
            STEP 5 • GST TAX INVOICING & BILLING
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <ReceiptText className="h-7 w-7 text-blue-500" />
            Tax Invoices & GST Registers
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl font-medium">
            Generate, print, and audit commercial GST invoices automatically tied to weighbridge dispatch manifests.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button asChild className="h-10 px-5 rounded-xl bg-sky-400 hover:bg-sky-500 text-white font-bold text-xs gap-1.5 shadow-md shadow-sky-400/25 transition-all">
            <Link href="/dispatch">
              <CheckCircle2 className="h-4 w-4 stroke-[2.5]" /> Issue from Dispatch
            </Link>
          </Button>
        </div>
      </div>

      {/* 2. 3 PERFORMANCE KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* 1. INVOICED THIS MONTH */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              INVOICED THIS MONTH
            </span>
            <div className="h-8 w-8 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-900">
              {formatCurrencyINR(stats.invoicedThisMonth)}
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Gross billed revenue
            </p>
          </div>
        </div>

        {/* 2. TOTAL INVOICES ISSUED */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              TOTAL INVOICES
            </span>
            <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
              <FileCheck className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-emerald-700">
              {stats.totalInvoicesCount} <span className="text-sm font-semibold text-slate-400 font-sans">Issued</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Active tax bills generated
            </p>
          </div>
        </div>

        {/* 3. AVERAGE INVOICE VALUE */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              AVG INVOICE TICKET
            </span>
            <div className="h-8 w-8 rounded-xl bg-purple-50 text-purple-500 flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-900">
              {formatCurrencyINR(stats.avgInvoiceValue)}
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Per dispatch shipment ticket
            </p>
          </div>
        </div>
      </div>

      {/* 3. MULTI-FILTERS BAR */}
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 shrink-0 mr-1">
            <Filter className="h-4 w-4 text-sky-500" /> Filters:
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 text-xs w-[140px] bg-slate-50/70 border-slate-200 rounded-xl">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="ISSUED">Issued</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="Search Invoice # or Client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 text-xs w-[220px] bg-slate-50/70 border-slate-200 rounded-xl"
          />

          <Button type="submit" size="sm" className="h-9 text-xs font-bold rounded-xl bg-sky-400 hover:bg-sky-500 text-white">
            Search
          </Button>

          {search && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                fetchData(1, "");
              }}
              className="h-9 text-xs text-rose-600 hover:bg-rose-50 rounded-xl"
            >
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}

          <span className="text-xs text-slate-400 font-mono ml-auto">
            {total} Invoices Found
          </span>
        </form>
      </div>

      {/* 4. INVOICES DATA TABLE */}
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
