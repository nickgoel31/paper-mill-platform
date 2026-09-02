"use client";

import * as React from "react";
import { toast } from "sonner";
import { createManualWastageLog } from "@/server/services/wastage-service";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Loader2, Scissors } from "lucide-react";

interface WastageLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productionRuns: { id: string; runNumber: string }[];
  onSuccess: () => void;
}

export function WastageLogModal({
  open,
  onOpenChange,
  productionRuns,
  onSuccess,
}: WastageLogModalProps) {
  const [productionRunId, setProductionRunId] = React.useState<string>("NONE");
  const [wastageKgStr, setWastageKgStr] = React.useState<string>("");
  const [wastageType, setWastageType] = React.useState<string>("REJECT");
  const [reason, setReason] = React.useState<string>("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const isInvalid = !wastageKgStr || parseFloat(wastageKgStr) <= 0 || !reason.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvalid) return;

    setIsSubmitting(true);
    try {
      await createManualWastageLog({
        productionRunId: productionRunId !== "NONE" ? productionRunId : undefined,
        wastageKg: parseFloat(wastageKgStr),
        wastageType,
        reason,
      });

      toast.success("Wastage log recorded successfully.");
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to record wastage log");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2 text-slate-900">
              <Scissors className="h-5 w-5 text-amber-600" />
              <DialogTitle className="text-base font-bold">
                Log Wastage / Scrap Entry
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              Record floor trim, web breaks, or damaged inventory scrap.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 text-xs">
            {/* Associated Run (Optional) */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-800">Associated Production Run (Optional)</label>
              <Select value={productionRunId} onValueChange={setProductionRunId}>
                <SelectTrigger className="h-9 text-xs bg-white">
                  <SelectValue placeholder="Select run or choose general floor wastage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">General Floor / Warehouse Scrap (No Run)</SelectItem>
                  {productionRuns.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      Run #{r.runNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Wastage Classification */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-800">Wastage Classification</label>
              <Select value={wastageType} onValueChange={setWastageType}>
                <SelectTrigger className="h-9 text-xs bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRIM">Edge Trim Waste</SelectItem>
                  <SelectItem value="REJECT">Paper Break / Slitter Jam Reject</SelectItem>
                  <SelectItem value="OTHER">Handling Damage / Warehouse Scrap</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Weight in kg */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-800">
                Wastage Weight (kg) <span className="text-destructive">*</span>
              </label>
              <Input
                type="number"
                step="any"
                min="0.1"
                placeholder="e.g. 450"
                className="font-mono text-sm h-9 bg-white"
                value={wastageKgStr}
                onChange={(e) => setWastageKgStr(e.target.value)}
                required
              />
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-800">
                Detailed Reason / Notes <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="e.g. Blade dullness caused uneven edge trim, forklift puncture"
                className="text-xs h-9 bg-white"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
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
              type="submit"
              size="sm"
              disabled={isSubmitting || isInvalid}
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Recording...
                </>
              ) : (
                "Save Wastage Entry"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
