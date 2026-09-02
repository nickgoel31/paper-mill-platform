"use client";

import * as React from "react";
import { formatWidthInch, formatTrimPercent, formatWeightKg } from "@/lib/utils";
import { PatternResult, PatternCutResult } from "@/lib/solver-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, AlertTriangle, CheckCircle2, TrendingUp, Scissors } from "lucide-react";

interface MachineLimits {
  name: string;
  maxDeckleInch: number;
  minTrimInch: number;
  maxTrimInch: number;
}

interface PatternOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pattern: PatternResult;
  machine: MachineLimits;
  gsm: number;
  availableItems: Array<{
    id: string;
    orderNumber?: string;
    widthInch: number;
  }>;
  onSave: (updatedPattern: PatternResult) => void;
}

export function PatternOverrideDialog({
  open,
  onOpenChange,
  pattern,
  machine,
  gsm,
  availableItems,
  onSave,
}: PatternOverrideDialogProps) {
  const [cuts, setCuts] = React.useState<PatternCutResult[]>(pattern.cuts);
  const [repetitions, setRepetitions] = React.useState<number>(pattern.repetitions);
  const [selectedItemIdToAdd, setSelectedItemIdToAdd] = React.useState<string>("");

  React.useEffect(() => {
    setCuts(pattern.cuts);
    setRepetitions(pattern.repetitions);
  }, [pattern]);

  // Recalculate Live Width and Trim
  const usedWidthInch = cuts.reduce((acc, c) => acc + c.width_inch * c.count, 0);
  const trimWidthInch = Math.max(0, machine.maxDeckleInch - usedWidthInch);
  const trimPercent = (trimWidthInch / machine.maxDeckleInch) * 100;

  // Recalculate Estimated KG
  const runLengthM = repetitions * 1000.0;
  const estimatedKg = cuts.reduce((acc, c) => {
    const widthM = c.width_inch * 0.0254;
    return acc + widthM * runLengthM * (gsm / 1000.0) * c.count;
  }, 0);

  // Validate Trim Bounds
  const isTrimTooLow = trimWidthInch < machine.minTrimInch - 0.01;
  const isTrimTooHigh = trimWidthInch > machine.maxTrimInch + 0.01;
  const isExceedingDeckle = usedWidthInch > machine.maxDeckleInch;
  const isValid = !isTrimTooLow && !isTrimTooHigh && !isExceedingDeckle && cuts.length > 0;

  // Diff Calculations
  const initialTrimPct = pattern.trim_percent;
  const trimDiff = trimPercent - initialTrimPct;

  const handleCutCountChange = (orderItemId: string, newCount: number) => {
    if (newCount <= 0) {
      setCuts((prev) => prev.filter((c) => c.order_item_id !== orderItemId));
    } else {
      setCuts((prev) =>
        prev.map((c) =>
          c.order_item_id === orderItemId ? { ...c, count: newCount } : c
        )
      );
    }
  };

  const handleAddCut = () => {
    if (!selectedItemIdToAdd) return;
    const item = availableItems.find((it) => it.id === selectedItemIdToAdd);
    if (!item) return;

    const existing = cuts.find((c) => c.order_item_id === item.id);
    if (existing) {
      handleCutCountChange(item.id, existing.count + 1);
    } else {
      setCuts((prev) => [
        ...prev,
        {
          order_item_id: item.id,
          width_inch: item.widthInch,
          count: 1,
        },
      ]);
    }
    setSelectedItemIdToAdd("");
  };

  const handleSave = () => {
    if (!isValid) return;

    const updated: PatternResult = {
      ...pattern,
      used_width_inch: Number(usedWidthInch.toFixed(2)),
      trim_width_inch: Number(trimWidthInch.toFixed(2)),
      trim_percent: Number(trimPercent.toFixed(2)),
      repetitions,
      estimated_kg: Number(estimatedKg.toFixed(2)),
      is_manually_edited: true,
      cuts: cuts.filter((c) => c.count > 0),
    };

    onSave(updated);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-2xl font-sans p-6">
        <DialogHeader className="border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-sky-50 text-sky-500 flex items-center justify-center">
              <Scissors className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                Edit Cutting Pattern #{pattern.sequence}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {machine.name} • {formatWidthInch(machine.maxDeckleInch)} Max Deckle • {gsm} GSM
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Live Trim & Deckle Gauge Box */}
          <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-100 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Used Width</span>
                <strong className="text-sm font-mono text-slate-900 font-black">
                  {formatWidthInch(usedWidthInch)}
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Trim Waste</span>
                <strong
                  className={`text-sm font-mono font-black ${
                    isValid ? "text-slate-900" : "text-rose-600"
                  }`}
                >
                  {formatWidthInch(trimWidthInch)} ({trimPercent.toFixed(2)}%)
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Trim Variance</span>
                <strong
                  className={`text-sm font-mono font-black ${
                    trimDiff < 0
                      ? "text-emerald-600"
                      : trimDiff > 0
                      ? "text-amber-600"
                      : "text-slate-500"
                  }`}
                >
                  {trimDiff > 0 ? `+${trimDiff.toFixed(2)}%` : `${trimDiff.toFixed(2)}%`}
                </strong>
              </div>
            </div>

            {/* Validation Alerts */}
            {!isValid && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1">
                <strong>Invalid Pattern Dimensions:</strong>
                {isExceedingDeckle && <div>• Total cuts exceed machine deckle ({machine.maxDeckleInch}&quot;).</div>}
                {isTrimTooLow && (
                  <div>• Trim ({trimWidthInch.toFixed(2)}&quot;) is below minimum edge trim ({machine.minTrimInch}&quot;).</div>
                )}
                {isTrimTooHigh && (
                  <div>• Trim ({trimWidthInch.toFixed(2)}&quot;) exceeds maximum allowed trim ({machine.maxTrimInch}&quot;).</div>
                )}
              </div>
            )}
          </div>

          {/* Cuts List */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700">Reel Cuts in this Pattern</label>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {cuts.map((cut) => {
                const itemMeta = availableItems.find((it) => it.id === cut.order_item_id);
                return (
                  <div
                    key={cut.order_item_id}
                    className="p-3 rounded-xl border border-slate-100 bg-white shadow-xs flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-900">
                        {formatWidthInch(cut.width_inch)}
                      </span>
                      {itemMeta?.orderNumber === "STOCK" || !itemMeta ? (
                        <span className="text-[10px] text-amber-700 bg-amber-100 font-extrabold px-1.5 py-0.5 rounded ml-1.5 font-sans uppercase">
                          ★ Stock Preset
                        </span>
                      ) : (
                        <span className="text-[11px] text-sky-600 ml-1.5 font-sans font-bold">
                          ({itemMeta.orderNumber})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 font-bold">Qty:</span>
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        className="h-8 w-16 text-center font-mono text-xs rounded-lg"
                        value={cut.count}
                        onChange={(e) =>
                          handleCutCountChange(cut.order_item_id, parseInt(e.target.value, 10) || 0)
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCutCountChange(cut.order_item_id, 0)}
                        className="h-8 w-8 text-slate-400 hover:text-rose-600 rounded-lg"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add Item Cut Dropdown */}
          <div className="flex items-center gap-2 pt-1">
            <Select value={selectedItemIdToAdd} onValueChange={setSelectedItemIdToAdd}>
              <SelectTrigger className="h-9 text-xs bg-slate-50/70 border-slate-200 rounded-xl flex-1">
                <SelectValue placeholder="Add another reel size to pattern..." />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {availableItems.map((it) => (
                  <SelectItem key={it.id} value={it.id} className="text-xs">
                    {formatWidthInch(it.widthInch)} — {it.orderNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!selectedItemIdToAdd}
              onClick={handleAddCut}
              className="h-9 text-xs font-bold rounded-xl gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Add Cut
            </Button>
          </div>

          {/* Repetitions Input */}
          <div className="space-y-1 pt-2 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-700">Pattern Repetitions</label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={1000}
                className="h-9 w-28 font-mono text-xs rounded-xl bg-slate-50/70 border-slate-200"
                value={repetitions}
                onChange={(e) => setRepetitions(parseInt(e.target.value, 10) || 1)}
              />
              <span className="text-xs text-slate-400 font-mono">
                ≈ {formatWeightKg(estimatedKg)} output weight
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-9 px-4 rounded-xl text-xs font-bold"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!isValid}
            onClick={handleSave}
            className="h-9 px-5 rounded-xl bg-sky-400 hover:bg-sky-500 text-white font-bold text-xs shadow-md shadow-sky-400/25 transition-all"
          >
            Apply Manual Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
