"use client";

import * as React from "react";
import { toast } from "sonner";
import { PackageCheck, Scissors, Loader2, X, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assignStockToOrderItem } from "@/server/services/deckle-service";

export interface StockMatchCandidate {
  stockItemId: string;
  reelNumber: string | null;
  quantityKg: number;
  location: string | null;
}

export interface StockMatchForDemand {
  orderItemId: string;
  candidates: StockMatchCandidate[];
}

interface DemandItemLite {
  id: string;
  orderNumber: string;
  clientName: string;
  widthInch: number;
  gsm: number;
}

interface StockMatchBannerProps {
  matches: StockMatchForDemand[];
  demandItems: DemandItemLite[];
  onAssigned: () => void;
}

/**
 * Before anything gets cut, flags demand lines that already have a matching
 * reel sitting AVAILABLE in the warehouse — cutting a fresh one would be
 * wasteful. The planner either assigns the existing (FIFO-first) reel or
 * dismisses it for this session and cuts anyway.
 */
export function StockMatchBanner({ matches, demandItems, onAssigned }: StockMatchBannerProps) {
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const [assigningId, setAssigningId] = React.useState<string | null>(null);

  const visible = matches.filter((m) => !dismissed.has(m.orderItemId));
  if (visible.length === 0) return null;

  const handleAssign = async (orderItemId: string) => {
    setAssigningId(orderItemId);
    try {
      const result = await assignStockToOrderItem(orderItemId);
      toast.success(`Assigned reel ${result.reelNumber || ""} to this order line — no cut needed.`);
      onAssigned();
    } catch (err: any) {
      toast.error(err.message || "Failed to assign existing stock");
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
        <Boxes className="h-4.5 w-4.5 text-amber-600" />
        {visible.length} demand line{visible.length > 1 ? "s" : ""} already have matching stock in the warehouse
      </div>
      <p className="text-xs text-amber-800/80">
        These widths/GSMs are already sitting AVAILABLE — assign the existing reel instead of
        cutting a new one, or dismiss to cut anyway.
      </p>

      <div className="space-y-2">
        {visible.map((m) => {
          const item = demandItems.find((d) => d.id === m.orderItemId);
          if (!item) return null;
          const best = m.candidates[0];
          const isBusy = assigningId === m.orderItemId;

          return (
            <div
              key={m.orderItemId}
              className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-amber-200/70 px-3 py-2.5 text-xs"
            >
              <div className="font-mono font-bold text-slate-900">
                {item.orderNumber} <span className="text-slate-400 font-sans">({item.clientName})</span>
              </div>
              <span className="font-mono text-slate-600">
                {item.widthInch}&quot; @ {item.gsm} GSM
              </span>
              <span className="font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg">
                {best.reelNumber || "Reel"} • {best.quantityKg.toFixed(0)} kg
                {m.candidates.length > 1 ? ` (+${m.candidates.length - 1} more)` : ""}
              </span>

              <div className="ml-auto flex items-center gap-1.5">
                <Button
                  size="sm"
                  disabled={isBusy}
                  onClick={() => handleAssign(m.orderItemId)}
                  className="h-7 px-2.5 text-[11px] rounded-lg gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
                  Assign Existing Stock
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isBusy}
                  onClick={() => setDismissed((prev) => new Set(prev).add(m.orderItemId))}
                  className="h-7 px-2.5 text-[11px] rounded-lg gap-1 text-slate-600"
                >
                  <Scissors className="h-3.5 w-3.5" /> Cut Anyway
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
