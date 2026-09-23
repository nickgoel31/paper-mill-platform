"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { createStockItem } from "@/server/services/stock-service";
import { formatWeightKg, formatWidthInch } from "@/lib/utils";
import { PaperSize, LengthUnit } from "@/generated/prisma/browser";
import { PAPER_SIZE_LABELS, PAPER_SIZES } from "@/lib/paper-size";
import { toInches } from "@/lib/units";
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
  Warehouse,
  ArrowLeft,
  Plus,
  Trash2,
  Boxes,
  Loader2,
  Info,
  Layers,
  MapPin,
  CheckCircle2,
  PackagePlus,
  Sparkles,
} from "lucide-react";

interface ReelEntry {
  id: string;
  /** As typed, in `widthUnit`. */
  widthInch: string;
  widthUnit: LengthUnit;
  gsm: string;
  paperType: string;
  size: PaperSize;
  bf: string;
  quantityKg: string;
  location: string;
  orderItemId?: string;
}

interface StockFormProps {
  /** Mill's default width unit (Settings). New reel rows start in this unit. */
  defaultUnit?: LengthUnit;
  machines: Array<{
    id: string;
    name: string;
    code: string;
    maxDeckleInch: number;
    minGsm: number;
    maxGsm: number;
  }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    client: { name: string; code: string };
    items: Array<{
      id: string;
      widthInch: number;
      enteredWidth?: number | null;
      enteredWidthUnit?: LengthUnit;
      gsm: number;
      paperType: string;
      size?: PaperSize;
      bf?: number;
      quantityKg: number;
      producedKg: number;
    }>;
  }>;
  presets?: Array<{
    id: string;
    name: string;
    code: string;
    widthInch: number;
    gsm: number;
    standardWeightKg: number;
    defaultLocation: string | null;
    shade: string | null;
    bf: string | null;
  }>;
  /** `{ gsm: kgPerInch }` from the GSM Weight Chart — used to auto-fill weight from width in real time. */
  gsmWeightMap?: Record<number, number>;
  /** Warehouse Locations master list (Masters → Warehouse Locations). Falls back to a built-in list if empty. */
  locations?: string[];
  /** Paper Types master list (Masters → Paper Types). */
  paperTypeOptions?: { value: string; label: string }[];
}

const COMMON_LOCATIONS = [
  "BAY-A (Primary Warehouse)",
  "BAY-B (High GSM Reels)",
  "BAY-C (Narrow Widths)",
  "BAY-D (Buffer Storage)",
  "CUTTER-STAGE (Direct to Rewinder)",
  "DISPATCH-HOLD (Pre-inspection)",
];

const STANDARD_GSMS = [80, 100, 120, 140, 160, 180, 200, 220, 250, 280, 300];

export function StockForm({
  defaultUnit = LengthUnit.INCH,
  machines,
  recentOrders,
  presets = [],
  gsmWeightMap = {},
  locations = [],
  paperTypeOptions = [],
}: StockFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  // Reels whose weight the user has typed directly — auto-fill stops
  // touching that row's weight once they do, until width/GSM changes again.
  const [manualWeight, setManualWeight] = React.useState<Set<string>>(new Set());
  const locationOptions = locations.length > 0 ? locations : COMMON_LOCATIONS;
  const defaultLocation = locationOptions[0];
  const defaultPaperType = paperTypeOptions[0]?.value || "NATURAL";

  const [reels, setReels] = React.useState<ReelEntry[]>([
    {
      id: "reel-1",
      widthInch: "28",
      widthUnit: defaultUnit,
      gsm: "140",
      paperType: defaultPaperType,
      size: PaperSize.NORMAL,
      bf: "18",
      quantityKg: "392",
      location: defaultLocation,
    },
  ]);

  const addPresetReel = (preset: NonNullable<StockFormProps["presets"]>[0]) => {
    setReels((prev) => [
      ...prev,
      {
        id: `reel-${Date.now()}`,
        widthInch: String(preset.widthInch),
        widthUnit: defaultUnit,
        gsm: String(preset.gsm),
        paperType: defaultPaperType,
        size: PaperSize.NORMAL,
        bf: preset.bf?.match(/\d+/)?.[0] || "18",
        quantityKg: String(preset.standardWeightKg),
        location: preset.defaultLocation || defaultLocation,
      },
    ]);
    toast.success(`Added ${preset.name} (${preset.widthInch}" / ${preset.gsm} GSM)`);
  };

  const addReelRow = () => {
    const lastReel = reels[reels.length - 1];
    setReels((prev) => [
      ...prev,
      {
        id: `reel-${Date.now()}`,
        widthInch: lastReel ? lastReel.widthInch : "36",
        widthUnit: lastReel ? lastReel.widthUnit : defaultUnit,
        gsm: lastReel ? lastReel.gsm : "120",
        paperType: lastReel ? lastReel.paperType : defaultPaperType,
        size: lastReel ? lastReel.size : PaperSize.NORMAL,
        bf: lastReel ? lastReel.bf : "18",
        quantityKg: lastReel ? lastReel.quantityKg : "500",
        location: lastReel ? lastReel.location : defaultLocation,
      },
    ]);
  };

  const removeReelRow = (id: string) => {
    if (reels.length <= 1) {
      toast.warning("At least one reel must be entered.");
      return;
    }
    setReels((prev) => prev.filter((r) => r.id !== id));
  };

  const updateReel = (id: string, field: keyof ReelEntry, value: string) => {
    if (field === "quantityKg") {
      setManualWeight((prev) => new Set(prev).add(id));
    }
    setReels((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, [field]: value };
        if (
          (field === "widthInch" || field === "widthUnit" || field === "gsm") &&
          !manualWeight.has(id)
        ) {
          const w = parseFloat(next.widthInch);
          const g = parseInt(next.gsm, 10);
          const kgPerInch = gsmWeightMap[g];
          if (!isNaN(w) && w > 0 && kgPerInch) {
            const widthInches = toInches(w, next.widthUnit);
            next.quantityKg = (kgPerInch * widthInches).toFixed(2);
          }
        }
        return next;
      })
    );
  };

  // Quick fill from existing order item
  const handleSelectOrderItem = (reelId: string, orderItemId: string) => {
    if (!orderItemId || orderItemId === "none") {
      updateReel(reelId, "orderItemId", "");
      return;
    }

    for (const ord of recentOrders) {
      const it = ord.items.find((i) => i.id === orderItemId);
      if (it) {
        setReels((prev) =>
          prev.map((r) =>
            r.id === reelId
              ? {
                  ...r,
                  orderItemId: it.id,
                  widthInch: String(it.enteredWidth ?? it.widthInch),
                  widthUnit: it.enteredWidthUnit ?? LengthUnit.INCH,
                  gsm: String(it.gsm),
                  paperType: it.paperType,
                  size: it.size ?? PaperSize.NORMAL,
                  bf: String(it.bf ?? 18),
                  quantityKg: String(Math.max(100, it.quantityKg - (it.producedKg || 0))),
                }
              : r
          )
        );
        toast.info(`Pre-filled specs from ${ord.orderNumber}`);
        break;
      }
    }
  };

  const totalKg = reels.reduce(
    (sum, r) => sum + (parseFloat(r.quantityKg) || 0),
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    for (let i = 0; i < reels.length; i++) {
      const r = reels[i];
      const w = parseFloat(r.widthInch);
      const g = parseInt(r.gsm, 10);
      const q = parseFloat(r.quantityKg);

      if (isNaN(w) || w <= 0) {
        toast.error(`Reel #${i + 1}: Valid width is required.`);
        return;
      }
      if (isNaN(g) || g < 40 || g > 400) {
        toast.error(`Reel #${i + 1}: Valid GSM between 40 and 400 is required.`);
        return;
      }
      if (isNaN(q) || q <= 0) {
        toast.error(`Reel #${i + 1}: Valid weight in kg is required.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let createdCount = 0;
      for (const r of reels) {
        await createStockItem({
          widthInch: parseFloat(r.widthInch),
          widthUnit: r.widthUnit,
          gsm: parseInt(r.gsm, 10),
          paperType: r.paperType,
          size: r.size,
          bf: r.bf?.trim() ? parseInt(r.bf, 10) : 18,
          quantityKg: parseFloat(r.quantityKg),
          location: r.location || defaultLocation,
          orderItemId: r.orderItemId && r.orderItemId !== "none" ? r.orderItemId : undefined,
        });
        createdCount++;
      }

      toast.success(
        `Successfully added ${createdCount} reel(s) (${(totalKg / 1000).toFixed(2)} MT) to warehouse inventory!`
      );
      router.push("/stock");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to add stock reels");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 font-sans pb-16 max-w-5xl mx-auto">
      {/* 1. TOP HERO BANNER */}
      <div className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-[11px] font-bold uppercase tracking-wide">
            INVENTORY • INWARD REEL ENTRY
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <PackagePlus className="h-7 w-7 text-sky-500" />
            Add Finished Goods Stock
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Inward manufactured reels, buffer reels, or returned stock directly into the warehouse inventory.
          </p>
        </div>

        <Button
          asChild
          variant="outline"
          className="h-10 px-4 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs gap-1.5"
        >
          <Link href="/stock">
            <ArrowLeft className="h-4 w-4" /> Back to Stock
          </Link>
        </Button>
      </div>

      {/* 2. SUMMARY STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            TOTAL REELS TO ADD
          </span>
          <div className="text-2xl font-black font-mono text-slate-900">
            {reels.length} <span className="text-sm font-semibold text-slate-400 font-sans">Reels</span>
          </div>
          <p className="text-[11px] text-slate-400">Batched inward entry</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            TOTAL WEIGHT (KG)
          </span>
          <div className="text-2xl font-black font-mono text-emerald-600">
            {totalKg.toLocaleString("en-IN", { maximumFractionDigits: 1 })}{" "}
            <span className="text-sm font-semibold text-slate-400 font-sans">KG</span>
          </div>
          <p className="text-[11px] text-slate-400">{(totalKg / 1000).toFixed(3)} Metric Tonnes</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            INITIAL STATUS
          </span>
          <div className="text-2xl font-black font-mono text-sky-600">
            AVAILABLE
          </div>
          <p className="text-[11px] text-slate-400">Ready for order allocation</p>
        </div>
      </div>

      {/* 2.5 QUICK PRESETS BAR */}
      {presets.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                1-Click Standard Reel Presets (Master Configs)
              </h3>
            </div>
            <Link
              href="/masters/stock-presets"
              className="text-[11px] font-bold text-sky-600 hover:text-sky-700 underline"
            >
              Manage Presets
            </Link>
          </div>

          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addPresetReel(p)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-sky-50 hover:border-sky-300 hover:text-sky-800 transition-all text-left text-xs group"
              >
                <Plus className="h-3 w-3 text-slate-400 group-hover:text-sky-600" />
                <span className="font-mono font-black text-slate-900 group-hover:text-sky-900">
                  {formatWidthInch(p.widthInch)}
                </span>
                <span className="font-mono text-slate-500 font-semibold">
                  {p.gsm} GSM
                </span>
                <span className="text-[10px] text-slate-400 font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">
                  {p.standardWeightKg} kg
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. REEL ENTRY FORM */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="space-y-0.5">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Boxes className="h-4 w-4 text-sky-500" /> Reel Specifications
              </h2>
              <p className="text-xs text-slate-500">
                Specify width, GSM, net weight, and warehouse bay for each reel.
              </p>
            </div>

            <Button
              type="button"
              onClick={addReelRow}
              className="h-9 px-4 rounded-xl bg-slate-100 text-slate-800 hover:bg-slate-200 font-bold text-xs gap-1.5 border border-slate-200"
            >
              <Plus className="h-3.5 w-3.5" /> Add Another Reel
            </Button>
          </div>

          <div className="space-y-4">
            {reels.map((reel, index) => (
              <div
                key={reel.id}
                className="p-4 rounded-2xl bg-slate-50/60 border border-slate-200/70 space-y-4 relative group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-6 w-6 rounded-lg bg-slate-900 text-white font-mono text-xs font-bold flex items-center justify-center">
                      #{index + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-800">
                      Reel Item #{index + 1}
                    </span>
                  </div>

                  {reels.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeReelRow(reel.id)}
                      className="h-8 px-2.5 text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Width */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Width <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="e.g. 36.00"
                        value={reel.widthInch}
                        onChange={(e) => updateReel(reel.id, "widthInch", e.target.value)}
                        className="h-10 rounded-xl bg-white font-mono font-bold text-slate-900 border-slate-200 text-sm"
                        required
                      />
                      <Select
                        value={reel.widthUnit}
                        onValueChange={(val) => updateReel(reel.id, "widthUnit", val)}
                      >
                        <SelectTrigger className="h-10 w-[68px] rounded-xl bg-white text-xs border-slate-200 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={LengthUnit.INCH} className="text-xs">in</SelectItem>
                          <SelectItem value={LengthUnit.CM} className="text-xs">cm</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* GSM */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      GSM Grade <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="e.g. 140"
                        value={reel.gsm}
                        onChange={(e) => updateReel(reel.id, "gsm", e.target.value)}
                        className="h-10 rounded-xl bg-white font-mono font-bold text-slate-900 border-slate-200 pr-10 text-sm"
                        required
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">
                        GSM
                      </span>
                    </div>
                  </div>

                  {/* Paper Type */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Paper Type</label>
                    <Select
                      value={reel.paperType}
                      onValueChange={(val) => updateReel(reel.id, "paperType", val)}
                    >
                      <SelectTrigger className="h-10 rounded-xl bg-white text-xs border-slate-200">
                        <SelectValue placeholder="Paper type" />
                      </SelectTrigger>
                      <SelectContent>
                        {reel.paperType && !paperTypeOptions.some((pt) => pt.value === reel.paperType) && (
                          <SelectItem value={reel.paperType} className="text-xs font-medium">
                            {reel.paperType} (current)
                          </SelectItem>
                        )}
                        {paperTypeOptions.map((pt) => (
                          <SelectItem key={pt.value} value={pt.value} className="text-xs font-medium">
                            {pt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Size */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Size</label>
                    <Select
                      value={reel.size}
                      onValueChange={(val) => updateReel(reel.id, "size", val)}
                    >
                      <SelectTrigger className="h-10 rounded-xl bg-white text-xs border-slate-200">
                        <SelectValue placeholder="Size" />
                      </SelectTrigger>
                      <SelectContent>
                        {PAPER_SIZES.map((sz) => (
                          <SelectItem key={sz} value={sz} className="text-xs font-medium">
                            {PAPER_SIZE_LABELS[sz]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Burst Factor — informational only, no deckle/matching effect */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">BF</label>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      placeholder="18"
                      value={reel.bf}
                      onChange={(e) => updateReel(reel.id, "bf", e.target.value)}
                      className="h-10 rounded-xl bg-white font-mono text-slate-900 border-slate-200 text-sm"
                    />
                  </div>

                  {/* Weight (Kg) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      Net Weight (Kg) <span className="text-rose-500">*</span>
                      {gsmWeightMap[parseInt(reel.gsm, 10)] && !manualWeight.has(reel.id) && (
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md normal-case">
                          auto (GSM chart)
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="e.g. 500"
                        value={reel.quantityKg}
                        onChange={(e) => updateReel(reel.id, "quantityKg", e.target.value)}
                        className="h-10 rounded-xl bg-white font-mono font-bold text-slate-900 border-slate-200 pr-8 text-sm"
                        required
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">
                        kg
                      </span>
                    </div>
                  </div>

                  {/* Warehouse Location */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Bay / Location
                    </label>
                    <Select
                      value={reel.location}
                      onValueChange={(val) => updateReel(reel.id, "location", val)}
                    >
                      <SelectTrigger className="h-10 rounded-xl bg-white text-xs border-slate-200">
                        <SelectValue placeholder="Select warehouse bay" />
                      </SelectTrigger>
                      <SelectContent>
                        {locationOptions.map((loc) => (
                          <SelectItem key={loc} value={loc} className="text-xs font-medium">
                            {loc}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Optional: Pre-link to existing Order line item */}
                {recentOrders.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/60 flex items-center gap-3">
                    <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
                      Allocate to Order (Optional):
                    </span>
                    <Select
                      value={reel.orderItemId || "none"}
                      onValueChange={(val) => handleSelectOrderItem(reel.id, val)}
                    >
                      <SelectTrigger className="h-8 rounded-lg bg-white text-[11px] border-slate-200 w-full sm:w-80">
                        <SelectValue placeholder="Select from active sales orders" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs">
                          None (Unassigned Buffer Stock)
                        </SelectItem>
                        {recentOrders.map((ord) =>
                          ord.items.map((it) => (
                            <SelectItem
                              key={it.id}
                              value={it.id}
                              className="text-xs font-mono"
                            >
                              {ord.orderNumber} ({ord.client.name}) — {it.widthInch}&quot; / {it.gsm} GSM ({it.quantityKg} kg)
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Bottom Action Row */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <Info className="h-4 w-4 text-sky-500" />
              <span>
                All entered reels will be marked as <strong>AVAILABLE</strong> in the Finished Goods warehouse.
              </span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Button
                asChild
                variant="outline"
                className="h-10 px-5 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs w-full sm:w-auto"
              >
                <Link href="/stock">Cancel</Link>
              </Button>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-10 px-7 rounded-xl bg-[#161622] hover:bg-[#202030] text-white font-bold text-xs gap-2 shadow-sm transition-all w-full sm:w-auto"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Saving Stock...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 stroke-[2.5]" /> Inward {reels.length} Reel(s) ({(totalKg / 1000).toFixed(2)} MT)
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
