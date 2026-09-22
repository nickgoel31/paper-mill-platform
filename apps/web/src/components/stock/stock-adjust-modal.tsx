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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  locations?: string[];
  onSuccess: () => void;
}

export function StockAdjustModal({
  open,
  onOpenChange,
  stockItem,
  locations = [],
  onSuccess,
}: StockAdjustModalProps) {
  const [deltaStr, setDeltaStr] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [locationValue, setLocationValue] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setDeltaStr("");
      setReason("");
      setLocationValue(stockItem?.location || "");
    }
  }, [open, stockItem?.location]);

  if (!stockItem) return null;

  const currentKg = stockItem.quantityKg;
  const deltaNum = parseFloat(deltaStr) || 0;
  const newKg = currentKg + deltaNum;
  const locationChanged = !!locationValue && locationValue !== (stockItem.location || "");
  const hasChange = deltaNum !== 0 || locationChanged;
  const isInvalid = !reason.trim() || isNaN(deltaNum) || !hasChange || newKg < 0;

  const handleAdjust = async () => {
    if (isInvalid) return;

    setIsSubmitting(true);
    try {
      await adjustStockQuantity(stockItem.id, deltaNum, reason, locationChanged ? locationValue : undefined);
      toast.success("Stock updated with audit log.");
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
            Adjust quantity and/or move to a different bay, with a mandatory reason. An audit log
            entry will be permanently written.
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

          {/* Location / Bay */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-800">Warehouse Bay / Location</label>
            <Select value={locationValue} onValueChange={setLocationValue}>
              <SelectTrigger className="h-9 text-xs bg-white">
                <SelectValue placeholder="Select warehouse bay" />
              </SelectTrigger>
              <SelectContent>
                {locationValue && !locations.includes(locationValue) && (
                  <SelectItem value={locationValue} className="text-xs">{locationValue} (current)</SelectItem>
                )}
                {locations.map((loc) => (
                  <SelectItem key={loc} value={loc} className="text-xs">{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
