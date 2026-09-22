"use client";

import * as React from "react";
import { toast } from "sonner";
import { updateStockItem } from "@/server/services/stock-service";
import { PaperType, PaperSize, StockStatus, LengthUnit } from "@/generated/prisma/browser";
import { PAPER_TYPE_LABELS, PAPER_TYPES } from "@/lib/paper-type";
import { PAPER_SIZE_LABELS, PAPER_SIZES } from "@/lib/paper-size";
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
import { Loader2, Pencil, AlertTriangle } from "lucide-react";

interface StockEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockItem: {
    id: string;
    reelNumber?: string | null;
    widthInch: number;
    enteredWidth?: number | null;
    enteredWidthUnit?: LengthUnit;
    gsm: number;
    paperType: PaperType;
    size: PaperSize;
    quantityKg: number;
    status: StockStatus;
    location?: string | null;
    remarks?: string | null;
  } | null;
  locations?: string[];
  onSuccess: () => void;
}

export function StockEditModal({ open, onOpenChange, stockItem, locations = [], onSuccess }: StockEditModalProps) {
  const [reelNumber, setReelNumber] = React.useState("");
  const [widthInch, setWidthInch] = React.useState("");
  const [widthUnit, setWidthUnit] = React.useState<LengthUnit>(LengthUnit.INCH);
  const [gsm, setGsm] = React.useState("");
  const [paperType, setPaperType] = React.useState<PaperType>(PaperType.NATURAL);
  const [size, setSize] = React.useState<PaperSize>(PaperSize.NORMAL);
  const [quantityKg, setQuantityKg] = React.useState("");
  const [status, setStatus] = React.useState<StockStatus>(StockStatus.AVAILABLE);
  const [location, setLocation] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open && stockItem) {
      setReelNumber(stockItem.reelNumber || "");
      setWidthInch(String(stockItem.enteredWidth ?? stockItem.widthInch));
      setWidthUnit(stockItem.enteredWidthUnit || LengthUnit.INCH);
      setGsm(String(stockItem.gsm));
      setPaperType(stockItem.paperType);
      setSize(stockItem.size);
      setQuantityKg(String(stockItem.quantityKg));
      setStatus(stockItem.status);
      setLocation(stockItem.location || "");
      setRemarks(stockItem.remarks || "");
      setReason("");
    }
  }, [open, stockItem]);

  if (!stockItem) return null;

  const isDispatched = stockItem.status === StockStatus.DISPATCHED;
  const isInvalid =
    isDispatched ||
    !reason.trim() ||
    !widthInch ||
    Number(widthInch) <= 0 ||
    !gsm ||
    Number(gsm) <= 0 ||
    !quantityKg ||
    Number(quantityKg) <= 0;

  const handleSave = async () => {
    if (isInvalid) return;
    setIsSubmitting(true);
    try {
      await updateStockItem({
        id: stockItem.id,
        reelNumber: reelNumber || null,
        widthInch: Number(widthInch),
        widthUnit,
        gsm: parseInt(gsm, 10),
        paperType,
        size,
        quantityKg: Number(quantityKg),
        status,
        location,
        remarks: remarks || null,
        reason,
      });
      toast.success("Stock item updated.");
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update stock item");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-slate-900">
            <Pencil className="h-5 w-5 text-primary" />
            <DialogTitle className="text-base font-bold">Edit Stock Item</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Every field is editable with a mandatory reason — an audit log entry is permanently written.
          </DialogDescription>
        </DialogHeader>

        {isDispatched ? (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            This reel has already been dispatched — it's a historical record and can't be edited.
          </div>
        ) : (
          <div className="space-y-4 py-1 text-xs">
            {/* Reel Number */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-800">Reel Number</label>
              <Input
                value={reelNumber}
                onChange={(e) => setReelNumber(e.target.value)}
                placeholder="Optional label — not a unique key"
                className="h-9 text-xs font-mono bg-white"
              />
            </div>

            {/* Width + GSM */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-800">Width *</label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="0.01"
                    value={widthInch}
                    onChange={(e) => setWidthInch(e.target.value)}
                    className="h-9 text-xs font-mono bg-white"
                  />
                  <Select value={widthUnit} onValueChange={(v) => setWidthUnit(v as LengthUnit)}>
                    <SelectTrigger className="h-9 w-[64px] text-xs bg-white shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={LengthUnit.INCH} className="text-xs">in</SelectItem>
                      <SelectItem value={LengthUnit.CM} className="text-xs">cm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-800">GSM *</label>
                <Input
                  type="number"
                  value={gsm}
                  onChange={(e) => setGsm(e.target.value)}
                  className="h-9 text-xs font-mono bg-white"
                />
              </div>
            </div>

            {/* Paper Type + Size */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-800">Paper Type</label>
                <Select value={paperType} onValueChange={(v) => setPaperType(v as PaperType)}>
                  <SelectTrigger className="h-9 text-xs bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAPER_TYPES.map((pt) => (
                      <SelectItem key={pt} value={pt} className="text-xs">{PAPER_TYPE_LABELS[pt]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-800">Size</label>
                <Select value={size} onValueChange={(v) => setSize(v as PaperSize)}>
                  <SelectTrigger className="h-9 text-xs bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAPER_SIZES.map((sz) => (
                      <SelectItem key={sz} value={sz} className="text-xs">{PAPER_SIZE_LABELS[sz]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quantity + Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-800">Quantity (kg) *</label>
                <Input
                  type="number"
                  step="0.1"
                  value={quantityKg}
                  onChange={(e) => setQuantityKg(e.target.value)}
                  className="h-9 text-xs font-mono font-bold bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-800">Status</label>
                <Select value={status} onValueChange={(v) => setStatus(v as StockStatus)}>
                  <SelectTrigger className="h-9 text-xs bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={StockStatus.AVAILABLE} className="text-xs">AVAILABLE</SelectItem>
                    <SelectItem value={StockStatus.ALLOCATED} className="text-xs">ALLOCATED</SelectItem>
                    <SelectItem value={StockStatus.REJECTED} className="text-xs text-rose-600 font-semibold">REJECTED</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Location + Remarks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-800">Warehouse Bay</label>
                <Select value={location} onValueChange={setLocation}>
                  <SelectTrigger className="h-9 text-xs bg-white">
                    <SelectValue placeholder="Select bay" />
                  </SelectTrigger>
                  <SelectContent>
                    {location && !locations.includes(location) && (
                      <SelectItem value={location} className="text-xs">{location} (current)</SelectItem>
                    )}
                    {locations.map((loc) => (
                      <SelectItem key={loc} value={loc} className="text-xs">{loc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-800">Remarks</label>
                <Input
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Optional"
                  className="h-9 text-xs bg-white"
                />
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-800">
                Mandatory Reason for Edit <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="e.g. Correcting scale entry error, quality rejection at QC"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="text-xs h-9 bg-white"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button type="button" variant="outline" size="sm" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!isDispatched && (
            <Button type="button" size="sm" disabled={isSubmitting || isInvalid} onClick={handleSave} className="shadow-sm gap-1.5">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              Save Changes
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
