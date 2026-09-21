"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  SortingState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  totalRows?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  isLoading?: boolean;
  searchPlaceholder?: string;
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onSortChange?: (field: string, order: "asc" | "desc") => void;
  actionButton?: React.ReactNode;
  filterComponent?: React.ReactNode;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  totalRows = 0,
  page = 1,
  pageSize = 20,
  totalPages = 1,
  isLoading = false,
  searchPlaceholder = "Search records...",
  searchTerm = "",
  onSearchChange,
  onPageChange,
  onPageSizeChange,
  actionButton,
  filterComponent,
}: DataTableProps<TData, TValue>) {
  const [localSearch, setLocalSearch] = React.useState(searchTerm);

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (onSearchChange && localSearch !== searchTerm) {
        onSearchChange(localSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, onSearchChange, searchTerm]);

  React.useEffect(() => {
    setLocalSearch(searchTerm);
  }, [searchTerm]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  });

  const startRecord = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, totalRows);

  return (
    <div className="space-y-4">
      {/* Top Toolbar (rendered only if search, action button, or filter is provided) */}
      {(onSearchChange || actionButton || filterComponent) && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {onSearchChange ? (
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={searchPlaceholder}
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  className="pl-9 h-10 text-xs sm:text-sm rounded-2xl bg-white border-slate-200/80 shadow-2xs focus-visible:ring-1 focus-visible:ring-slate-900"
                />
                {localSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setLocalSearch("");
                      onSearchChange?.("");
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {filterComponent}
            </div>
          ) : filterComponent ? (
            <div className="flex items-center gap-2 flex-1">{filterComponent}</div>
          ) : null}

          {actionButton && (
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              {actionButton}
            </div>
          )}
        </div>
      )}

      {/* Table Body Container */}
      <div className="rounded-[26px] border border-slate-100 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.03)] overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-slate-50/60 border-b border-slate-100 hover:bg-slate-50/60">
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-5 py-3.5">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Loading Skeleton Rows
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`} className="border-b border-slate-100/80">
                  {columns.map((_, colIndex) => (
                    <TableCell key={`skeleton-cell-${colIndex}`} className="px-5 py-4">
                      <Skeleton className="h-4 w-full rounded-md" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="hover:bg-slate-50/60 border-b border-slate-100/80 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-5 py-3.5 text-xs text-slate-700">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              // Empty State
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-16 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 mb-1">
                      <Search className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-bold text-slate-800">No records found</p>
                    <p className="text-xs text-slate-400 max-w-sm">
                      {localSearch
                        ? `No results matching "${localSearch}". Try clearing your search.`
                        : "There are no entries recorded yet."}
                    </p>
                    {localSearch && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 text-xs h-8 px-3 rounded-xl"
                        onClick={() => {
                          setLocalSearch("");
                          onSearchChange?.("");
                        }}
                      >
                        Clear Search
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Pagination Footer - Integrated inside the table card */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 px-6 py-4 border-t border-slate-100 bg-slate-50/30">
          <div className="font-mono text-[11px]">
            Showing <span className="font-semibold text-slate-900">{startRecord}</span> to{" "}
            <span className="font-semibold text-slate-900">{endRecord}</span> of{" "}
            <span className="font-semibold text-slate-900">{totalRows}</span> entries
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg bg-white border-slate-200"
                onClick={() => onPageChange?.(1)}
                disabled={page <= 1 || isLoading}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg bg-white border-slate-200"
                onClick={() => onPageChange?.(page - 1)}
                disabled={page <= 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <span className="text-xs font-mono font-medium px-2.5 text-slate-700">
                Page {page} of {totalPages || 1}
              </span>

              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg bg-white border-slate-200"
                onClick={() => onPageChange?.(page + 1)}
                disabled={page >= totalPages || isLoading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg bg-white border-slate-200"
                onClick={() => onPageChange?.(totalPages)}
                disabled={page >= totalPages || isLoading}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
