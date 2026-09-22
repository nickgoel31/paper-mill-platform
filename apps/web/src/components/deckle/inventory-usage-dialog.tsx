"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatWeightKg, formatWidthInch } from "@/lib/utils";
import type { InventoryAllocation } from "@/lib/deckle-inventory-match";
import { Boxes, CheckCircle2, Loader2 } from "lucide-react";

interface InventoryUsageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allocations: InventoryAllocation[];
  isBusy?: boolean;
  /**
   * Confirms the selection in one step: ticked reels are allocated as listed;
   * any unticked reels have their demand automatically folded back into the
   * cutting plan (re-solved if needed) — no separate re-run step required.
   */
  onConfirm: (keptStockItemIds: string[]) => void;
}

/**
 * Shown on the results step when free inventory was used instead of new
 * production. Tick exactly the reels you want to take from inventory; the
 * rest go back into production automatically on confirm.
 */
export function InventoryUsageDialog({
  open,
  onOpenChange,
  allocations,
  isBusy = false,
  onConfirm,
}: InventoryUsageDialogProps) {
  const [ticked, setTicked] = React.useState<Set<string>>(new Set());

  // Every reel starts ticked whenever a fresh set of allocations arrives.
  React.useEffect(() => {
    setTicked(new Set(allocations.map((a) => a.stockItemId)));
  }, [allocations]);

  const byOrder = React.useMemo(() => {
    const map = new Map<string, { clientName: string; rows: InventoryAllocation[] }>();
    for (const a of allocations) {
      if (!map.has(a.orderNumber)) map.set(a.orderNumber, { clientName: a.clientName, rows: [] });
      map.get(a.orderNumber)!.rows.push(a);
    }
    return Array.from(map.entries());
  }, [allocations]);

  const unticked = allocations.filter((a) => !ticked.has(a.stockItemId));
  const tickedKg = allocations
    .filter((a) => ticked.has(a.stockItemId))
    .reduce((sum, a) => sum + a.quantityKg, 0);

  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-emerald-600" />
            <DialogTitle className="text-base font-bold">
              Inventory used instead of new production
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            These free reels in inventory match your sales orders exactly (width and GSM). Tick the
            ones you want to allocate from stock — anything you leave unticked goes back into the
            cutting plan automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-1 pr-1">
          {byOrder.map(([orderNumber, group]) => (
            <div key={orderNumber} className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 flex items-center justify-between">
                <div>
                  <span className="font-mono font-bold text-sky-600 text-xs">{orderNumber}</span>
                  <span className="text-[11px] text-slate-500 ml-2">{group.clientName}</span>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  {formatWeightKg(group.rows.reduce((s, r) => s + r.quantityKg, 0))}
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {group.rows.map((a) => {
                  const on = ticked.has(a.stockItemId);
                  return (
                    <li key={a.stockItemId}>
                      <label
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer text-xs ${
                          on ? "" : "opacity-50"
                        }`}
                      >
                        <Checkbox checked={on} onCheckedChange={() => toggle(a.stockItemId)} />
                        <span className="font-mono font-black text-slate-900">
                          {formatWidthInch(a.widthInch)}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-mono font-bold text-[10px]">
                          {a.gsm} GSM
                        </span>
                        <span className="font-mono text-slate-700">{formatWeightKg(a.quantityKg)}</span>
                        <span className="ml-auto text-[11px] text-slate-400 truncate">
                          {a.location || "Warehouse"}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="text-[11px] font-mono text-slate-500">
          {ticked.size} of {allocations.length} reels selected · {formatWeightKg(tickedKg)}
        </div>

        <DialogFooter className="gap-2 sm:gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            disabled={isBusy || ticked.size === 0}
            onClick={() => onConfirm(Array.from(ticked))}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {unticked.length > 0
              ? `Allocate ${ticked.size} & Replan ${unticked.length} Reel${unticked.length === 1 ? "" : "s"}`
              : "Approve Allocation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
