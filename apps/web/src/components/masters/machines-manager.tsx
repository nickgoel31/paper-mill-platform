"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { CrudSheet } from "@/components/data-table/crud-sheet";
import { ConfirmDialog } from "@/components/data-table/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { machineSchema, MachineFormInput } from "@/lib/schemas/machine";
import {
  getMachines,
  createMachine,
  updateMachine,
  deleteMachine,
} from "@/server/services/machine-service";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Gauge,
  Sliders,
  Layers,
  Sparkles,
} from "lucide-react";

interface MachineRow {
  id: string;
  name: string;
  code: string;
  maxDeckleInch: any;
  minDeckleInch: any;
  minTrimInch: any;
  maxTrimInch: any;
  trimMode?: "BOTH_SIDES" | "ONE_SIDE";
  minGsm: number;
  maxGsm: number;
  speedMpm: number | null;
  isActive: boolean;
  _count?: { productionRuns: number };
}

interface MachinesManagerProps {
  initialData: {
    rows: MachineRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  isAdmin: boolean;
}

// Visual Deckle Live Preview Component
function DecklePreview({
  maxDeckle,
  minDeckle,
  minTrim,
  maxTrim,
  trimMode = "BOTH_SIDES",
}: {
  maxDeckle: number;
  minDeckle: number;
  minTrim: number;
  maxTrim: number;
  trimMode?: "BOTH_SIDES" | "ONE_SIDE";
}) {
  const bothSides = trimMode !== "ONE_SIDE";
  const safeMax = typeof maxDeckle === "number" && !isNaN(maxDeckle) ? Math.max(1, maxDeckle) : 100;
  const safeMin = typeof minDeckle === "number" && !isNaN(minDeckle) ? Math.min(safeMax, Math.max(0, minDeckle)) : 40;
  const safeMinTrim = typeof minTrim === "number" && !isNaN(minTrim) ? Math.max(0, minTrim) : 0;
  const safeMaxTrim = typeof maxTrim === "number" && !isNaN(maxTrim) ? Math.min(safeMax, Math.max(safeMinTrim, maxTrim)) : 5;

  const minTrimPercent = Math.min(25, (safeMinTrim / safeMax) * 100);
  const maxTrimPercent = Math.min(30, (safeMaxTrim / safeMax) * 100);
  const usableWidthPercent = Math.max(10, 100 - maxTrimPercent);

  return (
    <div className="p-4 rounded-lg bg-slate-900 text-white space-y-3 shadow-inner">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold flex items-center gap-1.5 text-amber-400">
          <Sparkles className="h-3.5 w-3.5" />
          Live Deckle Constraint Preview (RULE B)
        </span>
        <span className="font-mono text-slate-300">
          Max Web: <strong className="text-white">{safeMax.toFixed(2)}&quot;</strong>
        </span>
      </div>

      {/* Horizontal Deckle Graphic Bar */}
      <div className="space-y-1.5">
        <div className="h-8 w-full bg-slate-800 rounded flex overflow-hidden border border-slate-700 relative text-[10px] font-mono select-none">
          {/* Left mandatory edge trim (both-sided machines only) */}
          {bothSides && safeMinTrim > 0 ? (
            <div
              style={{ width: `${Math.max(3, minTrimPercent / 2)}%` }}
              className="bg-red-500/80 border-r border-red-400 flex items-center justify-center text-white shrink-0"
              title={`Mandatory Left Trim: ${(safeMinTrim / 2).toFixed(2)}"`}
            >
              ✂
            </div>
          ) : null}

          {/* Usable Cutting Pattern Width */}
          <div
            style={{ width: `${usableWidthPercent}%` }}
            className="bg-emerald-700/90 border-r border-dashed border-emerald-400 flex items-center justify-center text-emerald-100 font-semibold px-2 flex-1"
          >
            Usable Pattern Width (~{(safeMax - safeMaxTrim).toFixed(1)}&quot; to {safeMax.toFixed(1)}&quot;)
          </div>

          {/* Max Trim Margin Allowance */}
          {safeMaxTrim > safeMinTrim ? (
            <div
              style={{ width: `${Math.max(4, maxTrimPercent - minTrimPercent)}%` }}
              className="bg-amber-500/80 border-r border-amber-300 flex items-center justify-center text-slate-950 font-bold shrink-0"
              title={`Acceptable Trim Band: ${safeMinTrim.toFixed(2)}" to ${safeMaxTrim.toFixed(2)}"`}
            >
              Trim Band
            </div>
          ) : null}

          {/* Right mandatory edge trim (all of it on one-sided machines) */}
          {safeMinTrim > 0 ? (
            <div
              style={{ width: `${Math.max(3, bothSides ? minTrimPercent / 2 : minTrimPercent)}%` }}
              className="bg-red-500/80 flex items-center justify-center text-white shrink-0"
              title={`Mandatory ${bothSides ? "Right " : ""}Trim: ${(bothSides ? safeMinTrim / 2 : safeMinTrim).toFixed(2)}"`}
            >
              ✂
            </div>
          ) : null}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />
            Min Trim: {safeMinTrim.toFixed(2)}&quot;
            {bothSides ? ` (${(safeMinTrim / 2).toFixed(2)}" each side)` : " (one side)"}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
            Max Trim Limit: {safeMaxTrim.toFixed(2)}&quot;
          </span>
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
            Min Deckle Run: {safeMin.toFixed(2)}&quot;
          </span>
        </div>
      </div>
    </div>
  );
}

export function MachinesManager({ initialData, isAdmin }: MachinesManagerProps) {
  const [data, setData] = React.useState(initialData.rows);
  const [total, setTotal] = React.useState(initialData.total);
  const [page, setPage] = React.useState(initialData.page);
  const [pageSize, setPageSize] = React.useState(initialData.pageSize);
  const [totalPages, setTotalPages] = React.useState(initialData.totalPages);
  const [search, setSearch] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  // Sheet & Dialog State
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editingMachine, setEditingMachine] = React.useState<MachineRow | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deletingMachine, setDeletingMachine] = React.useState<MachineRow | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const form = useForm<MachineFormInput>({
    resolver: zodResolver(machineSchema),
    defaultValues: {
      name: "",
      code: "",
      maxDeckleInch: 196.0,
      minDeckleInch: 60.0,
      minTrimInch: 0.5,
      maxTrimInch: 6.0,
      trimMode: "BOTH_SIDES",
      minGsm: 80,
      maxGsm: 300,
      speedMpm: 450,
      isActive: true,
    },
  });

  // Watch fields for live visual deckle preview
  const watchedMaxDeckle = useWatch({ control: form.control, name: "maxDeckleInch" });
  const watchedMinDeckle = useWatch({ control: form.control, name: "minDeckleInch" });
  const watchedMinTrim = useWatch({ control: form.control, name: "minTrimInch" });
  const watchedMaxTrim = useWatch({ control: form.control, name: "maxTrimInch" });
  const watchedTrimMode = useWatch({ control: form.control, name: "trimMode" });

  const fetchData = React.useCallback(async (newPage: number, searchTerm: string) => {
    setIsLoading(true);
    try {
      const res = await getMachines({ page: newPage, pageSize, search: searchTerm });
      setData(res.rows as any);
      setTotal(res.total);
      setPage(res.page);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch machines");
    } finally {
      setIsLoading(false);
    }
  }, [pageSize]);

  const handleSearchChange = (term: string) => {
    setSearch(term);
    fetchData(1, term);
  };

  const handlePageChange = (newPage: number) => {
    fetchData(newPage, search);
  };

  // Open Create
  const handleOpenCreate = () => {
    setEditingMachine(null);
    form.reset({
      name: "",
      code: "",
      maxDeckleInch: 144.0,
      minDeckleInch: 50.0,
      minTrimInch: 0.5,
      maxTrimInch: 5.0,
      trimMode: "BOTH_SIDES",
      minGsm: 80,
      maxGsm: 280,
      speedMpm: 350,
      isActive: true,
    });
    setSheetOpen(true);
  };

  // Open Edit
  const handleOpenEdit = (machine: MachineRow) => {
    setEditingMachine(machine);
    form.reset({
      name: machine.name,
      code: machine.code,
      maxDeckleInch: Number(machine.maxDeckleInch),
      minDeckleInch: Number(machine.minDeckleInch),
      minTrimInch: Number(machine.minTrimInch),
      maxTrimInch: Number(machine.maxTrimInch),
      trimMode: machine.trimMode ?? "BOTH_SIDES",
      minGsm: machine.minGsm,
      maxGsm: machine.maxGsm,
      speedMpm: machine.speedMpm || null,
      isActive: machine.isActive,
    });
    setSheetOpen(true);
  };

  // Submit Handler
  const onSubmit = async (values: MachineFormInput) => {
    setIsSubmitting(true);
    try {
      const res = editingMachine
        ? await updateMachine(editingMachine.id, values)
        : await createMachine(values);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Machine "${values.name}" ${editingMachine ? "updated" : "created"} successfully.`
      );
      setSheetOpen(false);
      fetchData(page, search);
    } catch (err: any) {
      toast.error(err.message || "Failed to save machine.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Delete
  const handleOpenDelete = (machine: MachineRow) => {
    setDeletingMachine(machine);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingMachine) return;
    setIsSubmitting(true);
    setDeleteError(null);
    try {
      const res = await deleteMachine(deletingMachine.id);
      if (!res.success) {
        setDeleteError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(`Machine "${deletingMachine.name}" removed successfully.`);
      setDeleteDialogOpen(false);
      fetchData(page, search);
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete machine.");
      toast.error(err.message || "Failed to delete machine.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Columns definition
  const columns: ColumnDef<MachineRow>[] = [
    {
      accessorKey: "code",
      header: "Code",
      cell: ({ row }) => (
        <span className="font-mono font-bold text-primary">
          {row.getValue("code")}
        </span>
      ),
    },
    {
      accessorKey: "name",
      header: "Machine Name",
      cell: ({ row }) => (
        <span className="font-semibold text-slate-900">{row.getValue("name")}</span>
      ),
    },
    {
      accessorKey: "maxDeckleInch",
      header: () => <div className="text-right">Max Deckle</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono font-bold text-slate-950">
          {Number(row.getValue("maxDeckleInch")).toFixed(2)}&quot;
        </div>
      ),
    },
    {
      accessorKey: "minDeckleInch",
      header: () => <div className="text-right">Min Deckle</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-muted-foreground">
          {Number(row.getValue("minDeckleInch")).toFixed(2)}&quot;
        </div>
      ),
    },
    {
      accessorKey: "minTrimInch",
      header: () => <div className="text-right">Min Trim</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-muted-foreground">
          {Number(row.getValue("minTrimInch")).toFixed(2)}&quot;
          <div className="text-[10px] font-sans text-slate-400">
            {row.original.trimMode === "ONE_SIDE" ? "one side" : "both sides"}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "maxTrimInch",
      header: () => <div className="text-right">Max Trim</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-muted-foreground">
          {Number(row.getValue("maxTrimInch")).toFixed(2)}&quot;
        </div>
      ),
    },
    {
      id: "gsmRange",
      header: () => <div className="text-right">GSM Range</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono font-medium">
          {row.original.minGsm} – {row.original.maxGsm} GSM
        </div>
      ),
    },
    {
      accessorKey: "speedMpm",
      header: () => <div className="text-right">Speed</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-xs text-slate-600">
          {row.getValue("speedMpm") ? `${row.getValue("speedMpm")} mpm` : "—"}
        </div>
      ),
    },
    {
      accessorKey: "isActive",
      header: () => <div className="text-right">Status</div>,
      cell: ({ row }) => (
        <div className="text-right">
          <Badge
            variant={row.getValue("isActive") ? "success" : "destructive"}
            className="text-[10px]"
          >
            {row.getValue("isActive") ? "Operational" : "Disabled"}
          </Badge>
        </div>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const machine = row.original;
        if (!isAdmin) {
          return <span className="text-xs text-muted-foreground">View only</span>;
        }

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">Machine Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => handleOpenEdit(machine)}
                className="text-xs gap-2"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Machine & Deckle
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleOpenDelete(machine)}
                className="text-xs gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Machine
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <DataTable
        columns={columns}
        data={data}
        totalRows={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        isLoading={isLoading}
        searchPlaceholder="Search machine name or code..."
        searchTerm={search}
        onSearchChange={handleSearchChange}
        onPageChange={handlePageChange}
        actionButton={
          isAdmin ? (
            <Button
              size="sm"
              onClick={handleOpenCreate}
              className="gap-1.5 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Add Machine
            </Button>
          ) : undefined
        }
      />

      {/* CrudSheet for Machines with Live Deckle Preview */}
      <CrudSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editingMachine ? `Edit Machine — ${editingMachine.name}` : "Add Production Machine"}
        description="Machine deckles and trim boundaries are used directly by the 1D cutting stock solver microservice (RULE B)."
        isSubmitting={isSubmitting}
        submitLabel={editingMachine ? "Update Machine Deckle" : "Register Machine"}
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Live Visual Deckle Bar */}
            <DecklePreview
              maxDeckle={watchedMaxDeckle}
              minDeckle={watchedMinDeckle}
              minTrim={watchedMinTrim}
              maxTrim={watchedMaxTrim}
              trimMode={watchedTrimMode}
            />

            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Machine Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Machine 3 (144&quot;)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Machine Code (Unique) *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. M3"
                        className="font-mono uppercase"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Deckle & Trim Bounds */}
            <div className="p-3 rounded-lg border bg-slate-50 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                Deckle & Trim Boundaries (Inches)
              </span>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="maxDeckleInch"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold text-primary">
                        Max Deckle (Inches) *
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="196.00"
                          className="font-mono"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-[10px]">
                        Maximum web width the machine can produce.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="minDeckleInch"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold">
                        Min Deckle (Inches) *
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="60.00"
                          className="font-mono"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-[10px]">
                        Minimum usable web width for a run.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="minTrimInch"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold">
                        Min Edge Trim (Inches) *
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.50"
                          className="font-mono"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-[10px]">
                        {watchedTrimMode === "ONE_SIDE"
                          ? "Total mandatory edge trim, all on one side."
                          : `Total mandatory edge trim, split evenly: ${(
                              (Number(watchedMinTrim) || 0) / 2
                            ).toFixed(2)}" on each side.`}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="trimMode"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel className="text-xs font-semibold">Trim Sides *</FormLabel>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            {
                              value: "BOTH_SIDES",
                              label: "Both sides",
                              hint: "Trim is split across both edges",
                            },
                            {
                              value: "ONE_SIDE",
                              label: "One side",
                              hint: "All trim falls on a single edge",
                            },
                          ] as const
                        ).map((opt) => {
                          const selected = field.value === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => field.onChange(opt.value)}
                              className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                                selected
                                  ? "border-primary bg-primary/5"
                                  : "border-slate-200 hover:border-slate-300"
                              }`}
                            >
                              <div className="text-xs font-bold text-slate-900">{opt.label}</div>
                              <div className="text-[10px] text-slate-500">{opt.hint}</div>
                            </button>
                          );
                        })}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="maxTrimInch"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold">
                        Max Trim Waste (Inches) *
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="6.00"
                          className="font-mono"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-[10px]">
                        Solver rejects patterns above this trim.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* GSM and Speed */}
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="minGsm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Min GSM *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="80"
                        className="font-mono"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxGsm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Max GSM *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="300"
                        className="font-mono"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="speedMpm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Speed (MPM)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="450"
                        className="font-mono"
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="pt-2 border-t">
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="text-xs font-normal cursor-pointer">
                      Machine is operational and selectable for cutting stock optimization runs.
                    </FormLabel>
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
      </CrudSheet>

      {/* Confirmation Dialog for Soft Delete */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Machine Master"
        description="Are you sure you want to delete this machine? The machine will no longer be available for new cutting plans."
        itemName={deletingMachine ? `${deletingMachine.name} (${deletingMachine.code})` : ""}
        isLoading={isSubmitting}
        errorMessage={deleteError}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
