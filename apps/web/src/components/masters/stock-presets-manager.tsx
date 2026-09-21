"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  getStockPresets,
  createStockPreset,
  updateStockPreset,
  deleteStockPreset,
} from "@/server/services/stock-preset-service";
import { formatWeightKg, formatWidthInch } from "@/lib/utils";
import {
  BookmarkCheck,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  Layers,
  Sparkles,
  Loader2,
  Box,
  MapPin,
  CheckCircle2,
} from "lucide-react";

interface StockPresetRow {
  id: string;
  name: string;
  code: string;
  widthInch: number;
  gsm: number;
  standardWeightKg: number;
  defaultLocation: string | null;
  shade: string | null;
  bf: string | null;
  paperType: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: Date | string;
}

interface StockPresetsManagerProps {
  initialData: {
    rows: StockPresetRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  isAdmin: boolean;
}

export function StockPresetsManager({ initialData, isAdmin }: StockPresetsManagerProps) {
  const [data, setData] = React.useState(initialData.rows);
  const [total, setTotal] = React.useState(initialData.total);
  const [page, setPage] = React.useState(initialData.page);
  const [pageSize, setPageSize] = React.useState(initialData.pageSize);
  const [totalPages, setTotalPages] = React.useState(initialData.totalPages);
  const [search, setSearch] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  // Dialog State
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingPreset, setEditingPreset] = React.useState<StockPresetRow | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Form State
  const [formData, setFormData] = React.useState({
    name: "",
    code: "",
    widthInch: "36.00",
    gsm: "140",
    standardWeightKg: "500",
    defaultLocation: "BAY-A (Primary Warehouse)",
    shade: "NATURAL",
    bf: "18BF",
    paperType: "KRAFT",
    description: "",
  });

  const fetchPresets = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getStockPresets({ page, pageSize, search: search || undefined });
      setData(res.rows as StockPresetRow[]);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      toast.error(err.message || "Failed to load stock presets");
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search]);

  React.useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const handleOpenCreate = () => {
    setEditingPreset(null);
    setFormData({
      name: "",
      code: `PRESET-${Date.now().toString().slice(-4)}`,
      widthInch: "36.00",
      gsm: "140",
      standardWeightKg: "500",
      defaultLocation: "BAY-A (Primary Warehouse)",
      shade: "NATURAL",
      bf: "18BF",
      paperType: "KRAFT",
      description: "",
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (preset: StockPresetRow) => {
    setEditingPreset(preset);
    setFormData({
      name: preset.name,
      code: preset.code,
      widthInch: String(preset.widthInch),
      gsm: String(preset.gsm),
      standardWeightKg: String(preset.standardWeightKg),
      defaultLocation: preset.defaultLocation || "BAY-A (Primary Warehouse)",
      shade: preset.shade || "NATURAL",
      bf: preset.bf || "18BF",
      paperType: preset.paperType || "KRAFT",
      description: preset.description || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (editingPreset) {
        await updateStockPreset(editingPreset.id, {
          name: formData.name,
          widthInch: parseFloat(formData.widthInch),
          gsm: parseInt(formData.gsm, 10),
          standardWeightKg: parseFloat(formData.standardWeightKg),
          defaultLocation: formData.defaultLocation,
          shade: formData.shade,
          bf: formData.bf,
          paperType: formData.paperType,
          description: formData.description,
        });
        toast.success(`Preset "${formData.name}" updated successfully.`);
      } else {
        await createStockPreset({
          name: formData.name,
          code: formData.code,
          widthInch: parseFloat(formData.widthInch),
          gsm: parseInt(formData.gsm, 10),
          standardWeightKg: parseFloat(formData.standardWeightKg),
          defaultLocation: formData.defaultLocation,
          shade: formData.shade,
          bf: formData.bf,
          paperType: formData.paperType,
          description: formData.description,
        });
        toast.success(`Preset "${formData.name}" created successfully.`);
      }

      setIsDialogOpen(false);
      fetchPresets();
    } catch (err: any) {
      toast.error(err.message || "Failed to save stock preset");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete preset "${name}"?`)) return;

    try {
      await deleteStockPreset(id);
      toast.success(`Preset "${name}" deleted.`);
      fetchPresets();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete preset");
    }
  };

  const columns: ColumnDef<StockPresetRow>[] = [
    {
      accessorKey: "name",
      header: "PRESET SPECIFICATION",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="space-y-0.5">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <span>{item.name}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-semibold">{item.code}</span>
              {item.paperType && <span>• {item.paperType}</span>}
              {item.bf && <span>• {item.bf}</span>}
              {item.shade && <span>• Shade: {item.shade}</span>}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "widthInch",
      header: "REEL SIZE",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-mono font-black text-sm text-slate-900 bg-sky-50 text-sky-700 px-2.5 py-1 rounded-lg border border-sky-100">
            {formatWidthInch(row.original.widthInch)}
          </span>
          <span className="font-mono font-bold text-xs text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">
            {row.original.gsm} GSM
          </span>
        </div>
      ),
    },
    {
      accessorKey: "standardWeightKg",
      header: "STD. WEIGHT",
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <span className="font-mono font-bold text-xs text-slate-900">
            {formatWeightKg(row.original.standardWeightKg)}
          </span>
          <span className="block text-[11px] text-slate-400">
            {(row.original.standardWeightKg / 1000).toFixed(3)} MT / reel
          </span>
        </div>
      ),
    },
    {
      accessorKey: "defaultLocation",
      header: "DEFAULT BAY",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <MapPin className="h-3.5 w-3.5 text-slate-400" />
          <span>{row.original.defaultLocation || "BAY-A"}</span>
        </div>
      ),
    },
    {
      accessorKey: "description",
      header: "USAGE NOTES",
      cell: ({ row }) => (
        <span className="text-xs text-slate-500 max-w-xs truncate block" title={row.original.description || ""}>
          {row.original.description || "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0 rounded-lg hover:bg-slate-100">
                <MoreHorizontal className="h-4 w-4 text-slate-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 rounded-xl shadow-lg border-slate-100">
              <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Actions
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => handleOpenEdit(item)}
                className="text-xs font-semibold gap-2 cursor-pointer"
              >
                <Edit className="h-3.5 w-3.5 text-sky-500" /> Edit Preset
              </DropdownMenuItem>
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleDelete(item.id, item.name)}
                    className="text-xs font-semibold text-rose-600 gap-2 cursor-pointer focus:text-rose-600"
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
    <div className="space-y-6 font-sans">
      {/* 1. TOP HERO BANNER */}
      <div className="bg-white rounded-[26px] p-6 sm:p-7 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-[11px] font-bold uppercase tracking-wide">
            MASTER DATA • REPEATED CONFIGURATIONS
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <BookmarkCheck className="h-7 w-7 text-sky-500" />
            Stock Item Presets Master
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Configure standardized reel dimensions, GSMs, and average reel weights for fast 1-click inwarding.
          </p>
        </div>

        <Button
          onClick={handleOpenCreate}
          className="h-10 px-5 rounded-full bg-[#161622] hover:bg-[#202030] text-white font-bold text-xs gap-1.5 shadow-sm transition-all"
        >
          <Plus className="h-4 w-4 text-[#d4f842]" /> Create New Preset
        </Button>
      </div>

      {/* 2. STATS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
        {/* Card 1: Hero Dark Card */}
        <div className="relative overflow-hidden rounded-[26px] bg-[#161622] text-white p-6 shadow-xl flex flex-col justify-between min-h-[150px]">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#d4f842]/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total Configured Presets</span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#d4f842] text-black text-[11px] font-bold shadow-sm">
              <span>Catalog</span>
              <BookmarkCheck className="h-3 w-3" />
            </div>
          </div>
          <div className="space-y-1 mt-3">
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight">
              {total} <span className="text-sm font-semibold text-slate-400 font-sans">SKUs</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Fast-moving factory configurations</p>
          </div>
        </div>

        {/* Card 2: Avg Reel Size */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[150px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Avg Reel Size</span>
            <div className="h-8 w-8 rounded-full bg-sky-50 text-sky-500 flex items-center justify-center">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="space-y-1 mt-3">
            <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 tracking-tight">
              26&quot; – 49&quot;
            </div>
            <p className="text-[11px] text-slate-400 font-medium">120 & 140 GSM standard Kraft</p>
          </div>
        </div>

        {/* Card 3: Inward Acceleration */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[150px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Inward Acceleration</span>
            <div className="h-8 w-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <div className="space-y-1 mt-3">
            <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-700 tracking-tight">
              1-Click Fill
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Auto-fills dimensions on /stock/new</p>
          </div>
        </div>
      </div>

      {/* 3. DATA TABLE */}
      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="Search presets by name, code, width, bay..."
        searchTerm={search}
        onSearchChange={(t) => {
          setSearch(t);
          setPage(1);
        }}
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

      {/* 4. CREATE / EDIT PRESET MODAL */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 text-slate-900">
              <BookmarkCheck className="h-5 w-5 text-sky-500" />
              <DialogTitle className="text-base font-bold">
                {editingPreset ? "Edit Stock Item Preset" : "Create Stock Item Preset"}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500">
              Define standard reel specifications for frequently ordered and stocked inventory items.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs font-bold text-slate-700">Preset Name *</Label>
                <Input
                  placeholder="e.g. 18BF VK 140 GSM (36 Inch)"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="h-9 rounded-xl text-xs"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Preset Code *</Label>
                <Input
                  placeholder="e.g. PRESET-140-36"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="h-9 rounded-xl text-xs font-mono uppercase"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Default Bay</Label>
                <Input
                  placeholder="e.g. BAY-A"
                  value={formData.defaultLocation}
                  onChange={(e) => setFormData({ ...formData, defaultLocation: e.target.value })}
                  className="h-9 rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Width (Inches) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="36.00"
                  value={formData.widthInch}
                  onChange={(e) => setFormData({ ...formData, widthInch: e.target.value })}
                  className="h-9 rounded-xl text-xs font-mono font-bold"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">GSM Grade *</Label>
                <Input
                  type="number"
                  placeholder="140"
                  value={formData.gsm}
                  onChange={(e) => setFormData({ ...formData, gsm: e.target.value })}
                  className="h-9 rounded-xl text-xs font-mono font-bold"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Std. Reel Weight (Kg) *</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="500"
                  value={formData.standardWeightKg}
                  onChange={(e) => setFormData({ ...formData, standardWeightKg: e.target.value })}
                  className="h-9 rounded-xl text-xs font-mono font-bold"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Burst Factor (BF)</Label>
                <Input
                  placeholder="18BF"
                  value={formData.bf}
                  onChange={(e) => setFormData({ ...formData, bf: e.target.value })}
                  className="h-9 rounded-xl text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Shade</Label>
                <Input
                  placeholder="NATURAL / GY"
                  value={formData.shade}
                  onChange={(e) => setFormData({ ...formData, shade: e.target.value })}
                  className="h-9 rounded-xl text-xs uppercase"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Paper Type</Label>
                <Input
                  placeholder="KRAFT"
                  value={formData.paperType}
                  onChange={(e) => setFormData({ ...formData, paperType: e.target.value })}
                  className="h-9 rounded-xl text-xs uppercase"
                />
              </div>

              <div className="space-y-1 col-span-2">
                <Label className="text-xs font-bold text-slate-700">Usage Notes & Applications</Label>
                <Textarea
                  placeholder="Optional description of typical corrugator usage, customer preferences, etc."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="rounded-xl text-xs min-h-[60px]"
                />
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                className="h-9 rounded-xl text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-9 rounded-xl bg-[#161622] hover:bg-[#202030] text-white text-xs font-bold gap-1.5 shadow-xs transition-all"
              >
                {isSubmitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                {editingPreset ? "Update Preset" : "Save Preset"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
