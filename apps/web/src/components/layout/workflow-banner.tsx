"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type WorkflowStage =
  | "orders"
  | "deckle"
  | "production"
  | "dispatch"
  | "invoices";

interface StageInfo {
  id: WorkflowStage;
  stepNumber: number;
  label: string;
  href: string;
  description: string;
  nextLabel: string;
  nextHref: string;
}

const STAGES: Record<WorkflowStage, StageInfo> = {
  orders: {
    id: "orders",
    stepNumber: 1,
    label: "Sales Orders",
    href: "/orders",
    description:
      "Customer demand booked with exact roll widths, GSM, and tolerance bands.",
    nextLabel: "Step 2: Deckle Planning",
    nextHref: "/deckle",
  },
  deckle: {
    id: "deckle",
    stepNumber: 2,
    label: "Deckle Planning",
    href: "/deckle",
    description:
      "Group demand by GSM, run mathematical optimization, and release cutting runs.",
    nextLabel: "Step 3: Production Floor",
    nextHref: "/production",
  },
  production: {
    id: "production",
    stepNumber: 3,
    label: "Floor Production",
    href: "/production",
    description:
      "Operators slit paper rolls, log weights from scale, and record scrap.",
    nextLabel: "Step 4: Load & Dispatch",
    nextHref: "/dispatch",
  },
  dispatch: {
    id: "dispatch",
    stepNumber: 4,
    label: "Truck Dispatch",
    href: "/dispatch",
    description:
      "Print A4 Loading Sheet, confirm vehicle departure, and generate Gate Pass.",
    nextLabel: "Step 5: GST Invoices",
    nextHref: "/invoices",
  },
  invoices: {
    id: "invoices",
    stepNumber: 5,
    label: "GST Invoices",
    href: "/invoices",
    description:
      "1-Click tax invoice generation, Indian numbering words, and WhatsApp alerts.",
    nextLabel: "Back to Executive Overview",
    nextHref: "/",
  },
};

const ALL_STAGES: WorkflowStage[] = [
  "orders",
  "deckle",
  "production",
  "dispatch",
  "invoices",
];

interface WorkflowBannerProps {
  currentStage: WorkflowStage;
  customTip?: string;
}

export function WorkflowBanner({ currentStage, customTip }: WorkflowBannerProps) {
  const current = STAGES[currentStage];

  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white p-3.5 sm:p-4 rounded-xl border border-slate-800 shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
      {/* Left: Stepper Progress & Context */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Badge className="bg-amber-400 text-slate-950 font-mono font-bold text-[10px] px-2 py-0.5">
            STEP {current.stepNumber} OF 5
          </Badge>
          <span className="text-slate-400 font-medium">•</span>
          <span className="text-slate-300 font-semibold">{current.label}</span>
          {customTip && (
            <>
              <span className="text-slate-400 font-medium">•</span>
              <span className="text-amber-200 text-xs flex items-center gap-1 font-normal">
                <Sparkles className="h-3 w-3 text-amber-400 inline" /> {customTip}
              </span>
            </>
          )}
        </div>

        {/* 5-Step Mini Bar */}
        <div className="hidden sm:flex items-center gap-1 text-[11px] pt-0.5">
          {ALL_STAGES.map((stKey, idx) => {
            const st = STAGES[stKey];
            const isCurrent = stKey === currentStage;
            const isCompleted = st.stepNumber < current.stepNumber;

            return (
              <React.Fragment key={stKey}>
                <Link
                  href={st.href}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
                    isCurrent
                      ? "bg-amber-400 text-slate-950 font-bold shadow-xs"
                      : isCompleted
                      ? "text-emerald-400 hover:text-emerald-300 font-medium"
                      : "text-slate-400 hover:text-slate-200 font-normal"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-400 inline" />
                  ) : (
                    <span className="font-mono text-[10px]">{st.stepNumber}.</span>
                  )}
                  <span>{st.label}</span>
                </Link>
                {idx < ALL_STAGES.length - 1 && (
                  <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Right: Next Step Trigger */}
      <div className="flex items-center gap-2 shrink-0">
        <Button
          asChild
          size="sm"
          className="h-8 text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 gap-1.5 shadow-sm"
        >
          <Link href={current.nextHref}>
            {current.nextLabel} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
