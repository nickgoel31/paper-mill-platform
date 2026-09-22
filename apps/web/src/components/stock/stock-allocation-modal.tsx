"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  getPendingEligibleOrderItemsForStock,
  allocateStockToOrderItem,
} from "@/server/services/stock-service";
import { formatWidthInch, formatWeightKg } from "@/lib/utils";
import type { PaperType, PaperSize } from "@/generated/prisma/browser";
import { PAPER_TYPE_LABELS } from "@/lib/paper-type";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Link2, CheckCircle2, AlertCircle } from "lucide-react";

interface StockAllocationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockItem: {
    id: string;
    widthInch: number;
    gsm: number;
    quantityKg: number;
    location?: string | null;
    paperType?: PaperType;
    size?: PaperSize;
  } | null;
  onSuccess: () => void;
}

export function StockAllocationModal({
  open,
  onOpenChange,
  stockItem,
  onSuccess,
}: StockAllocationModalProps) {
  const [eligibleItems, setEligibleItems] = React.useState<any[]>([]);
  const [selectedOrderItemId, setSelectedOrderItemId] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open && stockItem) {
      setSelectedOrderItemId("");
      setIsLoading(true);
      getPendingEligibleOrderItemsForStock(stockItem.widthInch, stockItem.gsm, stockItem.paperType, stockItem.size)
        .then((items) => {
          setEligibleItems(items);
          if (items.length > 0) {
            setSelectedOrderItemId(items[0].id);
          }
        })
        .catch((err) => {
          toast.error(err.message || "Failed to find eligible orders");
        })
        .finally(() => setIsLoading(false));
    }
  }, [open, stockItem]);

  const handleAllocate = async () => {
    if (!stockItem || !selectedOrderItemId) return;

    setIsSubmitting(true);
    try {
      await allocateStockToOrderItem(stockItem.id, selectedOrderItemId);
      toast.success("Stock allocated to order successfully.");
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to allocate stock");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!stockItem) return null;

  const selectedTargetItem = eligibleItems.find((it) => it.id === selectedOrderItemId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            <DialogTitle className="text-base font-bold">
              Allocate Stock to Sales Order
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Link available inventory reel directly to an active customer order line item.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Stock Item Spec Card */}
          <div className="p-3 bg-slate-50 border rounded-lg flex items-center justify-between">
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-sans">
                Available Stock Item
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono font-bold text-sm text-slate-900">
                  {formatWidthInch(stockItem.widthInch)}
                </span>
                <Badge variant="outline" className="font-mono text-xs text-primary font-bold">
                  {stockItem.gsm} GSM
                </Badge>
                {stockItem.paperType && (
                  <Badge variant="outline" className="text-xs font-semibold">
                    {PAPER_TYPE_LABELS[stockItem.paperType]}
                  </Badge>
                )}
              </div>
            </div>

            <div className="text-right">
              <span className="text-muted-foreground block text-[10px] uppercase font-sans">
                Stock Quantity
              </span>
              <strong className="font-mono text-sm text-emerald-700">
                {formatWeightKg(stockItem.quantityKg)}
              </strong>
            </div>
          </div>

          {/* Target Order Selection */}
          <div className="space-y-2">
            <label className="font-semibold text-slate-800">
              Select Matching Pending Order Item ({eligibleItems.length} Available)
            </label>

            {isLoading ? (
              <div className="p-6 text-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1" />
                Finding matching orders for {formatWidthInch(stockItem.widthInch)} @ {stockItem.gsm} GSM...
              </div>
            ) : eligibleItems.length === 0 ? (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                No active confirmed orders currently require {formatWidthInch(stockItem.widthInch)} @ {stockItem.gsm} GSM.
              </div>
            ) : (
              <Select value={selectedOrderItemId} onValueChange={setSelectedOrderItemId}>
                <SelectTrigger className="h-10 text-xs bg-white">
                  <SelectValue placeholder="Select target order line..." />
                </SelectTrigger>
                <SelectContent>
                  {eligibleItems.map((it) => (
                    <SelectItem key={it.id} value={it.id} className="text-xs">
                      {it.orderNumber} — {it.clientName} ({it.clientCity}) [Ordered: {formatWeightKg(it.quantityKg)}, Rem: {formatWeightKg(Math.max(0, it.quantityKg - it.producedKg))}]
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Allocation Preview Impact */}
          {selectedTargetItem && (
            <div className="p-3 rounded-lg border bg-blue-50/50 space-y-1.5 font-mono text-[11px] text-blue-950">
              <div className="flex justify-between">
                <span>Order Line:</span>
                <strong>{selectedTargetItem.orderNumber} ({selectedTargetItem.clientName})</strong>
              </div>
              <div className="flex justify-between">
                <span>Target Demand:</span>
                <span>{formatWeightKg(selectedTargetItem.quantityKg)} (±{selectedTargetItem.tolerancePercent}%)</span>
              </div>
              <div className="flex justify-between">
                <span>Currently Produced:</span>
                <span>{formatWeightKg(selectedTargetItem.producedKg)}</span>
              </div>
              <div className="flex justify-between border-t border-blue-200 pt-1 text-xs font-bold text-emerald-900">
                <span>New Produced Total:</span>
                <span>{formatWeightKg(selectedTargetItem.producedKg + stockItem.quantityKg)}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isSubmitting || eligibleItems.length === 0 || !selectedOrderItemId}
            onClick={handleAllocate}
            className="shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Allocating...
              </>
            ) : (
              "Confirm Stock Allocation"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
