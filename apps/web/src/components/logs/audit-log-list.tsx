"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { getAuditLogs } from "@/server/services/audit-service";
import { ScrollText, Filter, X, Eye, ShieldAlert } from "lucide-react";

interface LogRow {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  before: any;
  after: any;
  createdAt: string | Date;
  user: { id: string; name: string; email: string; role: string } | null;
}

interface AuditLogListProps {
  initialData: {
    rows: LogRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  entityTypes: string[];
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UPDATE: "bg-sky-50 text-sky-700 border-sky-200",
  DELETE: "bg-rose-50 text-rose-700 border-rose-200",
  MANUAL_ADJUSTMENT: "bg-amber-50 text-amber-700 border-amber-200",
};

function actionBadgeClass(action: string) {
  for (const key of Object.keys(ACTION_COLORS)) {
    if (action.includes(key)) return ACTION_COLORS[key];
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export function AuditLogList({ initialData, entityTypes }: AuditLogListProps) {
  const [data, setData] = React.useState(initialData.rows);
  const [total, setTotal] = React.useState(initialData.total);
  const [page, setPage] = React.useState(initialData.page);
  const [pageSize, setPageSize] = React.useState(initialData.pageSize);
  const [totalPages, setTotalPages] = React.useState(initialData.totalPages);
  const [search, setSearch] = React.useState("");
  const [entityTypeFilter, setEntityTypeFilter] = React.useState("ALL");
  const [actionFilter, setActionFilter] = React.useState("ALL");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [detail, setDetail] = React.useState<LogRow | null>(null);

  const fetchData = React.useCallback(
    async (newPage: number) => {
      setIsLoading(true);
      try {
        const res = await getAuditLogs({
          page: newPage,
          pageSize,
          entityType: entityTypeFilter === "ALL" ? undefined : entityTypeFilter,
          action: actionFilter === "ALL" ? undefined : actionFilter,
          search: search || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        });
        setData(res.rows as LogRow[]);
        setTotal(res.total);
        setTotalPages(res.totalPages);
        setPage(res.page);
      } catch (err: any) {
        toast.error(err.message || "Failed to load logs");
      } finally {
        setIsLoading(false);
      }
    },
    [pageSize, entityTypeFilter, actionFilter, search, dateFrom, dateTo]
  );

  React.useEffect(() => {
    fetchData(1);
  }, [fetchData]);

  const hasActiveFilters =
    !!search || entityTypeFilter !== "ALL" || actionFilter !== "ALL" || !!dateFrom || !!dateTo;

  const clearFilters = () => {
    setSearch("");
    setEntityTypeFilter("ALL");
    setActionFilter("ALL");
    setDateFrom("");
    setDateTo("");
  };

  const columns: ColumnDef<LogRow>[] = [
    {
      accessorKey: "createdAt",
      header: "When",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-600">
          {new Date(row.getValue("createdAt")).toLocaleString("en-IN")}
        </span>
      ),
    },
    {
      accessorKey: "user",
      header: "User",
      cell: ({ row }) => {
        const u = row.original.user;
        return u ? (
          <div>
            <div className="text-xs font-bold text-slate-900">{u.name}</div>
            <div className="text-[10px] text-slate-400">{u.role}</div>
          </div>
        ) : (
          <span className="text-xs text-slate-400">System</span>
        );
      },
    },
    {
      accessorKey: "entityType",
      header: "Entity",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-slate-700">{row.getValue("entityType")}</span>
      ),
    },
    {
      accessorKey: "entityId",
      header: "Record",
      cell: ({ row }) => (
        <span className="font-mono text-[11px] text-slate-500">{String(row.getValue("entityId")).slice(0, 12)}</span>
      ),
    },
    {
      accessorKey: "action",
      header: "Action",
      cell: ({ row }) => {
        const action = row.getValue("action") as string;
        return (
          <span className={`inline-flex text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${actionBadgeClass(action)}`}>
            {action}
          </span>
        );
      },
    },
    {
      id: "details",
      header: "",
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setDetail(row.original)}>
          <Eye className="h-3.5 w-3.5" /> View
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6 font-sans pb-10">
      <div className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wide">
          ADMIN ONLY
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5 mt-1.5">
          <ScrollText className="h-7 w-7 text-slate-700" />
          Activity Log
        </h1>
        <p className="text-xs text-slate-500 max-w-2xl font-medium mt-1">
          Every create, edit, and delete across orders, inventory, dispatch, invoices, and settings —
          the things worth checking when something looks wrong or you need to know who changed what.
          Page views and reads are never logged here.
        </p>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 shrink-0 mr-1">
            <Filter className="h-4 w-4 text-sky-500" /> Filters:
          </div>

          <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
            <SelectTrigger className="h-9 text-xs w-[160px] bg-slate-50/70 border-slate-200 rounded-xl">
              <SelectValue placeholder="Entity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Entities</SelectItem>
              {entityTypes.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="h-9 text-xs w-[140px] bg-slate-50/70 border-slate-200 rounded-xl">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Actions</SelectItem>
              <SelectItem value="CREATE">CREATE</SelectItem>
              <SelectItem value="UPDATE">UPDATE</SelectItem>
              <SelectItem value="DELETE">DELETE</SelectItem>
            </SelectContent>
          </Select>

          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 text-xs w-[145px] bg-slate-50/70 border-slate-200 rounded-xl"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 text-xs w-[145px] bg-slate-50/70 border-slate-200 rounded-xl"
          />

          <Input
            placeholder="Search record id, user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 text-xs w-[220px] bg-slate-50/70 border-slate-200 rounded-xl"
          />

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs text-rose-600 hover:bg-rose-50 rounded-xl gap-1">
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}

          <span className="text-xs text-slate-400 font-mono ml-auto">{total} events</span>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        totalRows={total}
        onPageChange={(p) => fetchData(p)}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          fetchData(1);
        }}
        isLoading={isLoading}
      />

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-slate-700" />
              <DialogTitle className="text-base font-bold">
                {detail?.entityType} — {detail?.action}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              {detail && new Date(detail.createdAt).toLocaleString("en-IN")} · by{" "}
              {detail?.user?.name || "System"} · record {detail?.entityId}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <div className="font-bold text-slate-600 mb-1">Before</div>
              <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto max-h-80 text-[11px] font-mono whitespace-pre-wrap">
                {detail?.before ? JSON.stringify(detail.before, null, 2) : "—"}
              </pre>
            </div>
            <div>
              <div className="font-bold text-slate-600 mb-1">After</div>
              <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto max-h-80 text-[11px] font-mono whitespace-pre-wrap">
                {detail?.after ? JSON.stringify(detail.after, null, 2) : "—"}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
