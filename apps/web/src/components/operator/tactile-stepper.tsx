"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";

interface TactileStepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (val: number) => void;
  label?: string;
  unit?: string;
}

export function TactileStepper({
  value,
  min = 0,
  max = 9999,
  onChange,
  label,
  unit = "reps",
}: TactileStepperProps) {
  const handleDecrement = () => {
    if (value > min) {
      onChange(value - 1);
    }
  };

  const handleIncrement = () => {
    if (value < max) {
      onChange(value + 1);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {label && <span className="text-sm font-bold uppercase tracking-wider text-slate-300">{label}</span>}
      <div className="flex items-center gap-3 bg-slate-900 p-2 rounded-2xl border-2 border-slate-700 shadow-inner">
        {/* Decrement Button (Min 56px Tap Target) */}
        <button
          type="button"
          disabled={value <= min}
          onClick={handleDecrement}
          className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-white border border-slate-600 shadow-md text-2xl font-black select-none transition-transform active:scale-95"
          aria-label="Decrease"
        >
          <Minus className="h-8 w-8 stroke-[3]" />
        </button>

        {/* Big Number Display */}
        <div className="min-w-[120px] sm:min-w-[160px] text-center">
          <div className="text-4xl sm:text-5xl font-black font-mono text-amber-400 tracking-tight select-none">
            {value}
          </div>
          <div className="text-xs font-mono text-slate-400 font-bold uppercase tracking-wider mt-0.5">
            {unit}
          </div>
        </div>

        {/* Increment Button (Min 56px Tap Target) */}
        <button
          type="button"
          disabled={value >= max}
          onClick={handleIncrement}
          className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-500 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-white border border-emerald-500 shadow-md text-2xl font-black select-none transition-transform active:scale-95"
          aria-label="Increase"
        >
          <Plus className="h-8 w-8 stroke-[3]" />
        </button>
      </div>
    </div>
  );
}
