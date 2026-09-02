"use client";

import * as React from "react";
import Link from "next/link";
import { TUTORIAL_MODULES, TutorialStep } from "@/lib/tutorial-data";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  ArrowUpRight,
  Lightbulb,
  AlertCircle,
  HelpCircle,
  Factory,
  Compass,
  Play,
  Layers,
} from "lucide-react";

export function TutorialModal() {
  const [open, setOpen] = React.useState(false);
  const [selectedModuleIndex, setSelectedModuleIndex] = React.useState(0);

  const currentModule: TutorialStep = TUTORIAL_MODULES[selectedModuleIndex];

  const handleNext = () => {
    if (selectedModuleIndex < TUTORIAL_MODULES.length - 1) {
      setSelectedModuleIndex(selectedModuleIndex + 1);
    }
  };

  const handlePrev = () => {
    if (selectedModuleIndex > 0) {
      setSelectedModuleIndex(selectedModuleIndex - 1);
    }
  };

  return (
    <>
      {/* Topbar Launch Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 gap-1.5 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 shadow-sm transition-all animate-pulse"
      >
        <BookOpen className="h-3.5 w-3.5 text-amber-700" />
        ERP Walkthrough & Guide
      </Button>

      {/* Embedded Fullscreen / Large Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] p-0 flex flex-col overflow-hidden bg-slate-50 border-slate-200">
          {/* Header */}
          <div className="bg-slate-900 text-white p-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-400/20 text-amber-400 border border-amber-400/30">
                <Factory className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                  PaperMill ERP — Complete Operational Walkthrough
                  <Badge className="bg-amber-400 text-slate-950 font-mono text-[10px] font-bold">
                    STEP BY STEP
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  Interactive setup guide & tutorial for all 10 modules in the Kraft Paper Mill manufacturing lifecycle.
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">
                Module {selectedModuleIndex + 1} of {TUTORIAL_MODULES.length}
              </span>
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
            {/* Left Navigation Sidebar */}
            <div className="md:col-span-4 border-r bg-white p-3 space-y-1 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1 flex items-center gap-1.5">
                <Compass className="h-3.5 w-3.5" /> Modules Index
              </div>

              {TUTORIAL_MODULES.map((mod, idx) => {
                const isSelected = idx === selectedModuleIndex;
                return (
                  <button
                    key={mod.id}
                    onClick={() => setSelectedModuleIndex(idx)}
                    className={`w-full text-left p-2.5 rounded-lg text-xs transition-all flex items-start justify-between gap-2 ${
                      isSelected
                        ? "bg-slate-900 text-white font-semibold shadow-sm"
                        : "hover:bg-slate-100 text-slate-700 font-medium"
                    }`}
                  >
                    <div className="space-y-0.5 truncate">
                      <div className="truncate flex items-center gap-1.5">
                        <span className="font-mono text-[10px] opacity-70">
                          #{idx + 1}
                        </span>
                        <span className="truncate">{mod.title.replace(/^\d+\.\s*/, "")}</span>
                      </div>
                      <div
                        className={`text-[10px] truncate ${
                          isSelected ? "text-slate-300" : "text-muted-foreground"
                        }`}
                      >
                        {mod.badge}
                      </div>
                    </div>

                    <ChevronRight
                      className={`h-4 w-4 shrink-0 mt-0.5 transition-transform ${
                        isSelected ? "text-amber-400 translate-x-0.5" : "text-slate-400"
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            {/* Right Detailed Tutorial Content */}
            <div className="md:col-span-8 p-6 overflow-y-auto max-h-[calc(90vh-140px)] space-y-6 bg-slate-50/50">
              {/* Module Header Card */}
              <div className="bg-white p-5 rounded-xl border shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-bold font-mono">
                      {currentModule.badge}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      Role: {currentModule.roleRequired}
                    </Badge>
                  </div>

                  <Button
                    asChild
                    size="sm"
                    className="h-7 text-xs font-bold gap-1 bg-slate-900 text-white hover:bg-slate-800"
                  >
                    <Link
                      href={currentModule.route}
                      onClick={() => setOpen(false)}
                    >
                      Open {currentModule.title.split(".")[1] || "Module"}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-slate-950">
                    {currentModule.title}
                  </h2>
                  <p className="text-xs font-medium text-slate-600 mt-0.5">
                    {currentModule.subtitle}
                  </p>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border">
                  {currentModule.overview}
                </p>

                {/* Why It Matters Callout */}
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                  <Sparkles className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold block text-emerald-950 mb-0.5">
                      Why This Matters For Your Paper Mill:
                    </strong>
                    {currentModule.whyItMatters}
                  </div>
                </div>
              </div>

              {/* Key Concepts */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-primary" /> Key Concepts & Terminology
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentModule.keyConcepts.map((kc, i) => (
                    <Card key={i} className="bg-white border shadow-none">
                      <CardContent className="p-3.5 space-y-1 text-xs">
                        <strong className="text-slate-950 font-bold block flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />
                          {kc.term}
                        </strong>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          {kc.explanation}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Step-by-Step Setup Guide */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Play className="h-3.5 w-3.5 text-primary" /> Step-by-Step Execution Guide
                </h3>
                <div className="space-y-2.5">
                  {currentModule.setupSteps.map((st) => (
                    <div
                      key={st.step}
                      className="flex items-start gap-3 bg-white p-3.5 rounded-lg border text-xs shadow-none"
                    >
                      <div className="h-6 w-6 rounded-full bg-slate-900 text-white font-bold font-mono text-xs flex items-center justify-center shrink-0 mt-0.5">
                        {st.step}
                      </div>
                      <div className="space-y-1 flex-1">
                        <div className="font-bold text-slate-900">{st.action}</div>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          {st.details}
                        </p>
                        {st.tip && (
                          <div className="flex items-center gap-1 text-[10px] text-amber-800 bg-amber-50 px-2 py-1 rounded border border-amber-200 mt-1">
                            <Lightbulb className="h-3 w-3 text-amber-600 shrink-0" />
                            <span>
                              <strong>Tip:</strong> {st.tip}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rules & Gotchas */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-rose-500" /> Operational Rules & Gotchas
                </h3>
                <div className="p-3.5 rounded-lg bg-rose-50/60 border border-rose-200 text-xs text-rose-950 space-y-1.5">
                  {currentModule.rulesAndGotchas.map((rule, rIdx) => (
                    <div key={rIdx} className="flex items-start gap-2">
                      <span className="text-rose-500 font-bold leading-none mt-0.5">•</span>
                      <span className="text-[11px] leading-relaxed">{rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Navigation */}
          <div className="bg-white border-t p-3.5 px-6 flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrev}
              disabled={selectedModuleIndex === 0}
              className="text-xs gap-1 h-8"
            >
              <ChevronLeft className="h-4 w-4" /> Previous Module
            </Button>

            <div className="flex items-center gap-1.5">
              {TUTORIAL_MODULES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedModuleIndex(i)}
                  className={`h-2 rounded-full transition-all ${
                    i === selectedModuleIndex
                      ? "w-6 bg-slate-900"
                      : "w-2 bg-slate-200 hover:bg-slate-300"
                  }`}
                  title={`Go to module ${i + 1}`}
                />
              ))}
            </div>

            <Button
              size="sm"
              onClick={handleNext}
              disabled={selectedModuleIndex === TUTORIAL_MODULES.length - 1}
              className="text-xs gap-1 h-8 bg-slate-900 text-white hover:bg-slate-800"
            >
              Next Module <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
