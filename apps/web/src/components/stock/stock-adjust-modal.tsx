"use client";

import * as React from "react";
import { toast } from "sonner";
import { adjustStockQuantity } from "@/server/services/stock-service";
import { formatWidthInch, formatWeightKg } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2, Edit } from "lucide-react";

interface StockAdjustModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockItem: {
    id: string;
    widthInch: number;
    gsm: number;
    quantityKg: number;
    location?: string | null;
  } | null;
  onSuccess: () => void;
}

export function StockAdjustModal({
  open,
  onOpenChange,
  stockItem,
  onSuccess,
}: StockAdjustModalProps) {
  const [deltaStr, setDeltaStr] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setDeltaStr("");
      setReason("");
    }
  }, [open]);

  if (!stockItem) return null;

  const currentKg = stockItem.quantityKg;
  const deltaNum = parseFloat(deltaStr) || 0;
  const newKg = currentKg + deltaNum;
  const isInvalid = !reason.trim() || isNaN(deltaNum) || deltaNum === 0 || newKg < 0;

  const handleAdjust = async () => {
    if (isInvalid) return;

    setIsSubmitting(true);
    try {
      await adjustStockQuantity(stockItem.id, deltaNum, reason);
      toast.success("Stock quantity adjusted with audit log.");
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to adjust stock quantity");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-slate-900">
            <Edit className="h-5 w-5 text-primary" />
            <DialogTitle className="text-base font-bold">
              Manual Stock Adjustment (ADMIN ONLY)
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Adjust quantity with a mandatory reason. An audit log entry will be permanently written.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Stock Item Spec Card */}
          <div className="p-3 bg-slate-50 border rounded-lg flex items-center justify-between">
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-sans">
                Item Specification
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono font-bold text-sm text-slate-900">
                  {formatWidthInch(stockItem.widthInch)}
                </span>
                <Badge variant="outline" className="font-mono text-xs text-primary font-bold">
                  {stockItem.gsm} GSM
                </Badge>
              </div>
            </div>

            <div className="text-right">
              <span className="text-muted-foreground block text-[10px] uppercase font-sans">
                Current Quantity
              </span>
              <strong className="font-mono text-sm text-slate-900">
                {formatWeightKg(stockItem.quantityKg)}
              </strong>
            </div>
          </div>

          {/* Delta Input */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-800">
              Quantity Delta (+ / - kg)
            </label>
            <Input
              type="number"
              step="any"
              placeholder="e.g. +250 or -100"
              className="font-mono text-sm h-9 bg-white"
              value={deltaStr}
              onChange={(e) => setDeltaStr(e.target.value)}
            />
            <div className="flex justify-between text-[11px] font-mono text-muted-foreground pt-0.5">
              <span>New Resulting Quantity:</span>
              <strong className={newKg < 0 ? "text-destructive font-bold" : "text-slate-900"}>
                {formatWeightKg(Math.max(0, newKg))}
              </strong>
            </div>
          </div>

          {newKg < 0 && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Quantity cannot be reduced below zero.</span>
            </div>
          )}

          {/* Mandatory Reason Input */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-800">
              Mandatory Reason for Adjustment <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="e.g. Physical inventory cycle count adjustment, scale correction"
              className="text-xs h-9 bg-white"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
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
            disabled={isSubmitting || isInvalid}
            onClick={handleAdjust}
            className="shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              "Save Stock Adjustment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
