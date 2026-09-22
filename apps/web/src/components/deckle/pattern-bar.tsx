"use client";

import * as React from "react";
import { formatWidthInch, formatTrimPercent, formatWeightKg } from "@/lib/utils";
import type { LengthUnit } from "@/generated/prisma/browser";

export interface PatternCutDisplay {
  orderItemId: string;
  orderNumber?: string;
  clientName?: string;
  widthInch: number;
  count: number;
  isStockPreset?: boolean;
}

export interface PatternBarProps {
  deckleInch: number;
  usedWidthInch: number;
  trimWidthInch: number;
  trimPercent: number;
  repetitions: number;
  estimatedKg: number;
  sequence: number;
  cuts: PatternCutDisplay[];
  isManuallyEdited?: boolean;
  orderColorMap?: Record<string, string>;
  unit?: LengthUnit;
}

// Distinct width-based colors so different reel sizes are visually distinguishable
const WIDTH_COLORS = [
  { bg: "bg-sky-500", text: "text-white" },
  { bg: "bg-emerald-500", text: "text-white" },
  { bg: "bg-violet-500", text: "text-white" },
  { bg: "bg-blue-600", text: "text-white" },
  { bg: "bg-rose-500", text: "text-white" },
  { bg: "bg-indigo-500", text: "text-white" },
  { bg: "bg-teal-500", text: "text-white" },
  { bg: "bg-purple-600", text: "text-white" },
  { bg: "bg-cyan-600", text: "text-white" },
  { bg: "bg-pink-500", text: "text-white" },
];

export function PatternBar({
  deckleInch,
  usedWidthInch,
  trimWidthInch,
  trimPercent,
  repetitions,
  estimatedKg,
  sequence,
  cuts,
  isManuallyEdited = false,
  unit = "INCH" as LengthUnit,
}: PatternBarProps) {
  const fw = (v: number) => formatWidthInch(v, unit);
  const trimBenchmark = formatTrimPercent(trimPercent);

  // Assign colors by distinct width value (not by order)
  const distinctWidths = Array.from(new Set(cuts.map((c) => c.widthInch))).sort((a, b) => b - a);
  const widthColorMap = new Map<number, (typeof WIDTH_COLORS)[0]>();
  distinctWidths.forEach((w, idx) => {
    widthColorMap.set(w, WIDTH_COLORS[idx % WIDTH_COLORS.length]);
  });

  // Flatten cuts into individual reel blocks for proportional rendering
  const individualCuts: Array<{
    id: string;
    widthInch: number;
    color: (typeof WIDTH_COLORS)[0];
    widthPercent: number;
    orderNumber?: string;
    clientName?: string;
    isStockPreset?: boolean;
  }> = [];

  cuts.forEach((c) => {
    const color = widthColorMap.get(c.widthInch) || WIDTH_COLORS[0];
    for (let i = 0; i < c.count; i++) {
      individualCuts.push({
        id: `${c.orderItemId}-${i}`,
        widthInch: c.widthInch,
        color,
        widthPercent: (c.widthInch / deckleInch) * 100,
        orderNumber: c.orderNumber,
        clientName: c.clientName,
        isStockPreset: c.isStockPreset,
      });
    }
  });

  const trimPercentWidth = Math.max(0, (trimWidthInch / deckleInch) * 100);
  const outputMT = (estimatedKg / 1000).toFixed(3);

  return (
    <div className="space-y-3">
      {/* Pattern Header Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold text-slate-900 font-mono bg-slate-100 px-2.5 py-1 rounded-lg">
            #{sequence}
          </span>
          <span className="text-xs text-slate-500 font-medium">
            Ã—{repetitions} {repetitions === 1 ? "cut" : "cuts"}
          </span>
          {isManuallyEdited && (
            <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
              Edited
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            <span className="font-mono font-bold text-slate-900">{outputMT}</span>
            <span className="text-slate-400 ml-0.5">MT</span>
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${trimBenchmark.badgeClass}`}>
            {trimPercent.toFixed(2)}% trim
          </span>
        </div>
      </div>

      {/* Proportional Pattern Visualizer */}
      <div className="relative h-12 w-full rounded-xl overflow-hidden flex bg-slate-100 border border-slate-200/80 shadow-inner">
        {individualCuts.map((cut) => {
          const isStock = cut.isStockPreset || cut.orderNumber === "STOCK" || cut.orderNumber === "STOCK PRESET";
          return (
            <div
              key={cut.id}
              style={{ width: `${cut.widthPercent}%` }}
              className={`h-full flex flex-col items-center justify-center border-r border-white/40 select-none transition-all ${
                isStock
                  ? "bg-amber-500 text-slate-950 font-bold"
                  : `${cut.color.bg} ${cut.color.text}`
              }`}
              title={
                isStock
                  ? `â˜… STOCK PRESET (Inventory Reel): ${fw(cut.widthInch)}`
                  : `Order: ${cut.orderNumber || "Custom Cut"}${cut.clientName ? ` (${cut.clientName})` : ""} | Width: ${fw(cut.widthInch)}`
              }
            >
              <span className="font-mono font-black text-xs tracking-tight truncate px-1 leading-tight">
                {fw(cut.widthInch)}
              </span>
              <span
                className={`text-[9px] font-sans font-bold uppercase tracking-wider truncate px-1 leading-none mt-0.5 ${
                  isStock ? "text-amber-950 bg-amber-300/80 rounded px-1" : "opacity-90"
                }`}
              >
                {isStock ? "â˜… STOCK" : (cut.orderNumber || "DEMAND")}
              </span>
            </div>
          );
        })}

        {/* Trim Waste Segment */}
        {trimPercentWidth > 0.1 && (
          <div
            style={{ width: `${trimPercentWidth}%` }}
            className="h-full flex items-center justify-center bg-slate-200 text-slate-500 relative overflow-hidden border-l border-dashed border-slate-300 select-none"
            title={`Trim: ${fw(trimWidthInch)}`}
          >
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, #000, #000 2px, transparent 2px, transparent 5px)",
              }}
            />
            <span className="font-mono text-[10px] font-bold z-10 truncate px-0.5">
              {fw(trimWidthInch)}
            </span>
          </div>
        )}
      </div>

      {/* Detailed Slitting Blade & Order Attribution Breakdown */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs">
        {cuts.map((c, cIdx) => {
          const isStock = c.isStockPreset || c.orderNumber === "STOCK" || c.orderNumber === "STOCK PRESET";
          const colorObj = widthColorMap.get(c.widthInch) || WIDTH_COLORS[0];

          return (
            <div
              key={cIdx}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all ${
                isStock
                  ? "bg-amber-50/90 border-amber-300/80 text-amber-900 shadow-sm"
                  : "bg-white border-slate-200 text-slate-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
              }`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-sm ${
                  isStock ? "bg-amber-500" : colorObj.bg
                }`}
              />
              <span className="font-bold text-slate-900">
                {c.count}Ã—{fw(c.widthInch)}
              </span>
              <span className="text-slate-300">â†’</span>
              {isStock ? (
                <span className="text-[10px] uppercase font-sans font-black text-amber-800 bg-amber-200/70 px-1.5 py-0.5 rounded">
                  â˜… Stock Preset (Inventory)
                </span>
              ) : (
                <span className="font-sans font-bold text-sky-600 text-[11px] flex items-center gap-1">
                  <span>{c.orderNumber}</span>
                  {c.clientName && (
                    <span className="text-slate-400 font-normal truncate max-w-[120px]">
                      ({c.clientName})
                    </span>
                  )}
                </span>
              )}
            </div>
          );
        })}

        <span className="ml-auto text-slate-400 font-mono text-[11px] font-medium">
          Deckle: <strong>{fw(usedWidthInch)}</strong> / {fw(deckleInch)}
        </span>
      </div>
    </div>
  );
}
