"use client";

import * as React from "react";
import Link from "next/link";
import { TUTORIAL_MODULES, TutorialStep } from "@/lib/tutorial-data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  ArrowRight,
  Sparkles,
  Layers,
  Play,
  Lightbulb,
  AlertCircle,
  Factory,
  Compass,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Building,
  HelpCircle,
} from "lucide-react";

export function TutorialPageView() {
  const [selectedId, setSelectedId] = React.useState<string>(TUTORIAL_MODULES[0].id);

  const selectedModule: TutorialStep =
    TUTORIAL_MODULES.find((m) => m.id === selectedId) || TUTORIAL_MODULES[0];

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans pb-10">
      {/* 1. TOP HERO BANNER */}
      <div className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-[11px] font-bold uppercase tracking-wide">
            DOCUMENTATION • STANDARD OPERATING PROCEDURES
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <BookOpen className="h-7 w-7 text-sky-500" />
            PaperMill ERP System Guide & SOP
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl font-medium">
            Step-by-step setup guides, operational rules, mathematical deckle optimization workflows, and Indian GST invoicing standards for every single module in the mill.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button asChild className="h-10 px-5 rounded-xl bg-[#161622] hover:bg-[#202030] text-white font-bold text-xs gap-1.5 shadow-sm transition-all">
            <Link href="/deckle">
              <Play className="h-4 w-4 fill-current stroke-[2.5]" /> Open Deckle Planner
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-10 px-5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border-slate-200 text-xs font-bold gap-1.5 shadow-xs">
            <Link href="/orders/new">
              Create New Order <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* 2. GRID: LEFT MODULE INDEX & RIGHT STEP DETAILS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Index (4 Cols) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1 flex items-center gap-1.5">
            <Compass className="h-3.5 w-3.5" /> SOP Modules ({TUTORIAL_MODULES.length} Guides)
          </div>

          <div className="space-y-1.5">
            {TUTORIAL_MODULES.map((mod, idx) => {
              const isSelected = mod.id === selectedId;
              return (
                <button
                  key={mod.id}
                  onClick={() => setSelectedId(mod.id)}
                  className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? "bg-[#161622] text-white border-[#161622] shadow-sm font-semibold"
                      : "bg-white hover:bg-slate-50 border-slate-100 text-slate-700 font-medium shadow-[0_1px_4px_rgba(0,0,0,0.02)]"
                  }`}
                >
                  <div className="space-y-1 truncate">
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md font-bold ${
                          isSelected
                            ? "bg-white/20 text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        MOD {idx + 1}
                      </span>
                      <span className="text-xs truncate">{mod.title}</span>
                    </div>
                  </div>

                  <ChevronRight
                    className={`h-4 w-4 shrink-0 transition-transform ${
                      isSelected ? "text-white translate-x-0.5" : "text-slate-300"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Detail Content (8 Cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl p-6 sm:p-7 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-6">
          {/* Module Header */}
          <div className="border-b border-slate-100 pb-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-600 uppercase tracking-wide">
                {selectedModule.badge || "MODULE SOP"} • {selectedModule.roleRequired}
              </span>
              <Button asChild size="sm" variant="ghost" className="h-7 text-xs font-bold text-sky-600 hover:text-sky-700">
                <Link href={selectedModule.route}>
                  Go to {selectedModule.title} <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            </div>

            <h2 className="text-xl font-extrabold text-slate-900">
              {selectedModule.title}
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              {selectedModule.overview}
            </p>
            {selectedModule.whyItMatters && (
              <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-100 text-xs text-sky-950 font-medium">
                <strong>Why it matters:</strong> {selectedModule.whyItMatters}
              </div>
            )}
          </div>

          {/* Key Concepts */}
          {selectedModule.keyConcepts && selectedModule.keyConcepts.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-sky-500" /> Key Terminology & Concepts
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {selectedModule.keyConcepts.map((kc, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1 text-xs">
                    <strong className="text-slate-900 block">{kc.term}</strong>
                    <span className="text-slate-500 leading-relaxed block">{kc.explanation}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Steps Breakdown */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Step-by-Step Procedure
            </h3>

            <div className="space-y-3.5">
              {(selectedModule.setupSteps || []).map((step, idx) => (
                <div
                  key={idx}
                  className="p-5 rounded-2xl bg-slate-50/70 border border-slate-100 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-6 w-6 rounded-lg bg-[#161622] text-white flex items-center justify-center text-xs font-bold font-mono shrink-0">
                      {step.step || idx + 1}
                    </span>
                    <h4 className="text-xs font-bold text-slate-900">{step.action}</h4>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed pl-8">
                    {step.details}
                  </p>

                  {step.tip && (
                    <div className="ml-8 p-3 rounded-xl bg-amber-50 border border-amber-200/80 text-[11px] text-amber-900 flex items-start gap-2">
                      <Lightbulb className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        <strong>Pro-Tip:</strong> {step.tip}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Rules & Gotchas */}
          {selectedModule.rulesAndGotchas && selectedModule.rulesAndGotchas.length > 0 && (
            <div className="space-y-2.5 pt-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" /> Operational Rules & Mill Constraints
              </h3>
              <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200 text-xs text-amber-950 space-y-1.5">
                {selectedModule.rulesAndGotchas.map((r, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
