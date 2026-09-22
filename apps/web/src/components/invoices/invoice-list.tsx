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
import { InvoiceStatus, Role } from "@/generated/prisma/browser";
import {
  getInvoices,
  getInvoiceSummaryStats,
  createManualInvoice,
  getReceivablesAging,
  deleteInvoice,
  deleteInvoices,
} from "@/server/services/invoice-service";
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
  Plus,
  Trash2,
  Loader2,
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
  amountPaid?: number;
  balanceDue?: number;
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
  clients: { id: string; name: string; code: string }[];
  userRole: Role;
}

interface ManualLine {
  description: string;
  quantityKg: string;
  ratePerKg: string;
}

export function InvoiceList({ initialData, initialStats, clients, userRole }: InvoiceListProps) {
  const isAdmin = userRole === Role.ADMIN;
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = React.useState<{ mode: "single" | "bulk"; id?: string } | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const [data, setData] = React.useState(initialData.rows);
  const [total, setTotal] = React.useState(initialData.total);
  const [page, setPage] = React.useState(initialData.page);
  const [pageSize, setPageSize] = React.useState(initialData.pageSize);
  const [totalPages, setTotalPages] = React.useState(initialData.totalPages);
  const [stats, setStats] = React.useState(initialStats);
  const [arTotal, setArTotal] = React.useState<number | null>(null);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [isLoading, setIsLoading] = React.useState(false);

  // Manual/custom invoice creation
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newClientId, setNewClientId] = React.useState("");
  const [newLines, setNewLines] = React.useState<ManualLine[]>([
    { description: "", quantityKg: "", ratePerKg: "" },
  ]);
  const [isCreating, setIsCreating] = React.useState(false);

  const handleAddLine = () =>
    setNewLines((prev) => [...prev, { description: "", quantityKg: "", ratePerKg: "" }]);
  const handleRemoveLine = (idx: number) =>
    setNewLines((prev) => prev.filter((_, i) => i !== idx));
  const handleLineChange = (idx: number, field: keyof ManualLine, value: string) =>
    setNewLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));

  const handleCreateInvoice = async () => {
    if (!newClientId) {
      toast.error("Select a client.");
      return;
    }
    const lines = newLines
      .filter((l) => l.description.trim() && Number(l.quantityKg) > 0 && Number(l.ratePerKg) >= 0)
      .map((l) => ({
        description: l.description.trim(),
        quantityKg: Number(l.quantityKg),
        ratePerKg: Number(l.ratePerKg),
      }));
    if (lines.length === 0) {
      toast.error("Add at least one valid line item (description, quantity, rate).");
      return;
    }
    setIsCreating(true);
    try {
      const invoice = await createManualInvoice({ clientId: newClientId, lines });
      toast.success(`Invoice #${invoice.invoiceNumber} created.`);
      setCreateOpen(false);
      setNewClientId("");
      setNewLines([{ description: "", quantityKg: "", ratePerKg: "" }]);
      fetchData(1, search);
    } catch (err: any) {
      toast.error(err.message || "Failed to create invoice");
    } finally {
      setIsCreating(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.mode === "single" && deleteTarget.id) {
        await deleteInvoice(deleteTarget.id);
        toast.success("Invoice deleted.");
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(deleteTarget.id!);
          return next;
        });
      } else {
        const res = await deleteInvoices(Array.from(selectedIds));
        toast.success(`${res.deleted} invoice(s) deleted.`);
        if (res.skipped.length > 0) {
          toast.warning(`${res.skipped.length} invoice(s) skipped: ${res.skipped[0].reason}`);
        }
        setSelectedIds(new Set());
      }
      setDeleteTarget(null);
      fetchData(page, search);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    } finally {
      setIsDeleting(false);
    }
  };

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

  React.useEffect(() => {
    getReceivablesAging()
      .then((r) => setArTotal(r.totalOutstanding))
      .catch(() => setArTotal(null));
  }, [data]);

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
    ...(isAdmin
      ? [
          {
            id: "select",
            header: "",
            cell: ({ row }: any) => (
              <Checkbox
                checked={selectedIds.has(row.original.id)}
                onCheckedChange={() => toggleSelected(row.original.id)}
                aria-label="Select row"
              />
            ),
          } as ColumnDef<InvoiceRow>,
        ]
      : []),
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
      id: "balanceDue",
      header: () => <div className="text-right">Balance Due</div>,
      cell: ({ row }) => {
        const item = row.original;
        if (item.status !== InvoiceStatus.ISSUED) {
          return <div className="text-right text-xs text-slate-300">—</div>;
        }
        const balance = item.balanceDue ?? Number(item.totalAmount);
        const isPaid = balance <= 0.5;
        return (
          <div className="text-right">
            <div className={`font-mono font-bold text-xs ${isPaid ? "text-emerald-600" : "text-amber-600"}`}>
              {isPaid ? "PAID" : formatCurrencyINR(balance)}
            </div>
          </div>
        );
      },
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
              {isAdmin && item.status === InvoiceStatus.DRAFT && (
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
          <Button
            variant="outline"
            onClick={() => setCreateOpen(true)}
            className="h-10 px-5 rounded-xl border-slate-200 text-slate-700 font-bold text-xs gap-1.5"
          >
            <Plus className="h-4 w-4" /> New Invoice
          </Button>
          <Button asChild className="h-10 px-5 rounded-xl bg-[#161622] hover:bg-[#202030] text-white font-bold text-xs gap-1.5 shadow-sm transition-all">
            <Link href="/dispatch">
              <CheckCircle2 className="h-4 w-4 stroke-[2.5]" /> Issue from Dispatch
            </Link>
          </Button>
        </div>
      </div>

      {/* Custom / Manual Invoice Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Create Custom Invoice</DialogTitle>
            <DialogDescription className="text-xs">
              For billing not tied to a dispatch — GST is computed the same way as a dispatch invoice.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Client *</label>
              <Select value={newClientId} onValueChange={setNewClientId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="font-semibold text-slate-700">Line Items *</label>
              {newLines.map((l, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <Input
                    placeholder="Description"
                    value={l.description}
                    onChange={(e) => handleLineChange(idx, "description", e.target.value)}
                    className="h-9 text-xs flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="Qty (kg)"
                    value={l.quantityKg}
                    onChange={(e) => handleLineChange(idx, "quantityKg", e.target.value)}
                    className="h-9 text-xs w-24 font-mono"
                  />
                  <Input
                    type="number"
                    placeholder="Rate/kg"
                    value={l.ratePerKg}
                    onChange={(e) => handleLineChange(idx, "ratePerKg", e.target.value)}
                    className="h-9 text-xs w-24 font-mono"
                  />
                  {newLines.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveLine(idx)}
                      className="h-8 w-8 text-slate-400 hover:text-rose-600 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={handleAddLine} className="h-8 text-xs gap-1">
                <Plus className="h-3.5 w-3.5" /> Add Line
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateInvoice} disabled={isCreating} className="gap-1.5">
              {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCheck className="h-3.5 w-3.5" />}
              Create Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. PERFORMANCE KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: HERO DARK CARD (Invoiced This Month) */}
        <div className="relative overflow-hidden rounded-[26px] bg-[#161622] text-white p-6 shadow-xl flex flex-col justify-between min-h-[160px]">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#d4f842]/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-start justify-between relative z-10">
            <div>
              <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">
                Invoiced This Month
              </span>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1 font-mono">
                {formatCurrencyINR(stats.invoicedThisMonth)}
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#d4f842] text-black text-[11px] font-bold shadow-sm">
              <span>•••</span>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10 relative z-10">
            <div className="flex items-center gap-1 text-xs font-bold text-[#d4f842]">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Gross Billed Revenue</span>
            </div>
            <span className="text-[11px] text-slate-400">GST Reconciled</span>
          </div>
        </div>

        {/* Card 2: White Pill Card - Total Invoices Issued */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                Total Invoices
              </span>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-600 mt-1 font-mono">
                {stats.totalInvoicesCount} <span className="text-sm font-semibold text-slate-400 font-sans">Issued</span>
              </div>
            </div>
            <div className="w-7 h-7 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <FileCheck className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-500">Active tax bills</span>
            <span className="text-xs font-bold text-emerald-600">Reconciled</span>
          </div>
        </div>

        {/* Card 3: White Pill Card - Average Ticket */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                Avg Invoice Ticket
              </span>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-1 font-mono">
                {formatCurrencyINR(stats.avgInvoiceValue)}
              </div>
            </div>
            <div className="w-7 h-7 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
              <CreditCard className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-500">Per dispatch shipment</span>
            <span className="text-xs font-semibold text-slate-700">Average Weight Metric</span>
          </div>
        </div>

        {/* Card 4: Outstanding Receivables */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                Outstanding Receivables
              </span>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-amber-600 mt-1 font-mono">
                {arTotal === null ? "—" : formatCurrencyINR(arTotal)}
              </div>
            </div>
            <div className="w-7 h-7 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Receipt className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-500">Unpaid across issued invoices</span>
            <span className="text-xs font-semibold text-slate-700">Accounts Receivable</span>
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

          <Button type="submit" size="sm" className="h-9 text-xs font-bold rounded-xl bg-[#161622] hover:bg-[#202030] text-white shadow-xs">
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

          {isAdmin && selectedIds.size > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteTarget({ mode: "bulk" })}
              className="h-9 text-xs font-bold rounded-xl text-rose-600 border-rose-200 hover:bg-rose-50 gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete Selected ({selectedIds.size})
            </Button>
          )}

          <span className="text-xs text-slate-400 font-mono ml-auto">
            {total} Invoices Found
          </span>
        </form>
      </div>

      {/* 4. INVOICES DATA TABLE */}
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

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-600">
              {deleteTarget?.mode === "bulk" ? `Delete ${selectedIds.size} Invoice(s)?` : "Delete Invoice?"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              This permanently removes the invoice. Only DRAFT invoices can be deleted — issued GST
              invoices can only be cancelled, for compliance. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleConfirmDelete} disabled={isDeleting} className="gap-1.5">
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
