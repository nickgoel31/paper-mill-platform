"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Delete, Check, X, RotateCcw } from "lucide-react";

interface FullscreenNumpadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialValue?: number;
  unit?: string;
  onConfirm: (val: number) => void;
}

export function FullscreenNumpad({
  open,
  onOpenChange,
  title,
  initialValue = 0,
  unit = "kg",
  onConfirm,
}: FullscreenNumpadProps) {
  const [valStr, setValStr] = React.useState(initialValue > 0 ? String(initialValue) : "");

  React.useEffect(() => {
    if (open) {
      setValStr(initialValue > 0 ? String(initialValue) : "");
    }
  }, [open, initialValue]);

  const handleDigit = (digit: string) => {
    if (digit === "." && valStr.includes(".")) return;
    if (valStr.length >= 8) return;
    setValStr((prev) => (prev === "0" && digit !== "." ? digit : prev + digit));
  };

  const handleBackspace = () => {
    setValStr((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setValStr("");
  };

  const handleConfirm = () => {
    const parsed = parseFloat(valStr);
    onConfirm(isNaN(parsed) ? 0 : parsed);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 bg-slate-950 text-white border-slate-800 rounded-3xl">
        <DialogHeader className="text-center pb-2">
          <DialogTitle className="text-xl font-bold tracking-wide text-slate-200">
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Tap digits on screen to record precise mill weight.
          </DialogDescription>
        </DialogHeader>

        {/* Big Weight Display */}
        <div className="bg-slate-900 border-2 border-slate-700 p-4 rounded-2xl text-center mb-4 shadow-inner">
          <div className="text-5xl font-black font-mono text-emerald-400 tracking-tight">
            {valStr || "0"}
            <span className="text-xl text-slate-400 ml-2 font-normal font-sans">{unit}</span>
          </div>
        </div>

        {/* 3x4 Touch Grid (Minimum 60px tap targets) */}
        <div className="grid grid-cols-3 gap-3 font-mono">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleDigit(d)}
              className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 text-3xl font-bold text-white shadow transition-transform active:scale-95 flex items-center justify-center select-none"
            >
              {d}
            </button>
          ))}

          <button
            type="button"
            onClick={() => handleDigit(".")}
            className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 text-3xl font-black text-slate-300 shadow transition-transform active:scale-95 flex items-center justify-center select-none"
          >
            .
          </button>

          <button
            type="button"
            onClick={() => handleDigit("0")}
            className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 text-3xl font-bold text-white shadow transition-transform active:scale-95 flex items-center justify-center select-none"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            className="h-16 rounded-2xl bg-rose-950/70 hover:bg-rose-900 border border-rose-800 text-rose-300 shadow transition-transform active:scale-95 flex items-center justify-center select-none"
            aria-label="Backspace"
          >
            <Delete className="h-7 w-7" />
          </button>
        </div>

        {/* Action Controls */}
        <div className="grid grid-cols-2 gap-3 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleClear}
            className="h-14 rounded-xl bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 text-base font-bold gap-2"
          >
            <RotateCcw className="h-5 w-5" /> Clear
          </Button>

          <Button
            type="button"
            onClick={handleConfirm}
            className="h-14 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-base font-black gap-2 shadow-lg"
          >
            <Check className="h-6 w-6 stroke-[3]" /> Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
