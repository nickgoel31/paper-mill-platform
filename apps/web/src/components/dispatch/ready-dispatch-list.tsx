"use client";

import * as React from "react";
import Link from "next/link";
import { formatWeightKg } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Truck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  History,
  FileText,
  User,
  MapPin,
  PackageCheck,
  Send,
  Plus,
} from "lucide-react";
import { WorkflowBanner } from "@/components/layout/workflow-banner";

interface PendingBatch {
  id: string;
  batchNumber: string;
  status: string;
  plannedDispatchDate: Date | string | null;
  totalPlannedKg: number;
  truckNumber: string;
  truckCapacityKg: number;
  transporterName: string;
  driverName: string;
  driverPhone: string;
  orderCount: number;
  itemCount: number;
  fulfilledCount: number;
  readinessStatus: "READY" | "PARTIAL" | "NOT_PRODUCED";
  shortItems: Array<{
    orderNumber: string;
    clientName: string;
    widthInch: number;
    gsm: number;
    shortKg: number;
    requiredKg: number;
    producedKg: number;
  }>;
  clients: Array<{
    id: string;
    name: string;
    city: string;
    phone: string;
    whatsapp: string;
  }>;
}

interface ReadyDispatchListProps {
  batches: PendingBatch[];
}

export function ReadyDispatchList({ batches }: ReadyDispatchListProps) {
  const readyCount = batches.filter((b) => b.readinessStatus === "READY").length;
  const partialCount = batches.filter((b) => b.readinessStatus === "PARTIAL").length;
  const totalWeight = batches.reduce((acc, b) => acc + b.totalPlannedKg, 0);

  return (
    <div className="space-y-6 font-sans pb-10">
      {/* 1. TOP HERO BANNER */}
      <div className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold uppercase tracking-wide">
            STEP 4 • LOGISTICS & GATE PASS DISPATCH
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Send className="h-7 w-7 text-emerald-500" />
            Dispatch Desk & Loading Sheets
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl font-medium">
            Review truck load batches ready for weighbridge inspection, loading sheets, and gate pass dispatch.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button asChild className="h-10 px-5 rounded-xl bg-[#161622] hover:bg-[#202030] text-white font-bold text-xs gap-1.5 shadow-sm transition-all">
            <Link href="/loads/new">
              <Plus className="h-4 w-4 stroke-[2.5]" /> Build Truck Load
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-10 px-5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border-slate-200 text-xs font-bold gap-1.5 shadow-xs">
            <Link href="/dispatch/history">
              <History className="h-4 w-4 text-emerald-600" /> Dispatch History
            </Link>
          </Button>
        </div>
      </div>

      {/* 2. 4 PERFORMANCE KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: HERO DARK CARD (Total Manifest Weight) */}
        <div className="relative overflow-hidden rounded-[26px] bg-[#161622] text-white p-6 shadow-xl flex flex-col justify-between min-h-[160px]">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#d4f842]/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-start justify-between relative z-10">
            <div>
              <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">
                Total Manifest Weight
              </span>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1 font-mono">
                {(totalWeight / 1000).toFixed(1)} <span className="text-sm font-semibold text-slate-400 font-sans">MT</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#d4f842] text-black text-[11px] font-bold shadow-sm">
              <span>•••</span>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10 relative z-10">
            <div className="flex items-center gap-1 text-xs font-bold text-[#d4f842]">
              <Truck className="w-3.5 h-3.5" />
              <span>{batches.length} Loads Scheduled</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">{formatWeightKg(totalWeight)}</span>
          </div>
        </div>

        {/* Card 2: White Pill Card - 100% Ready */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                Ready for Gate Pass
              </span>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-600 mt-1 font-mono">
                {readyCount} <span className="text-sm font-semibold text-slate-400 font-sans">Trucks</span>
              </div>
            </div>
            <div className="w-7 h-7 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
            <span className="text-xs text-emerald-600 font-bold">100% produced & in stock</span>
            <span className="text-[11px] text-slate-400">Reeled</span>
          </div>
        </div>

        {/* Card 3: White Pill Card - Partial Production */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                Partial Production
              </span>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-amber-700 mt-1 font-mono">
                {partialCount} <span className="text-sm font-semibold text-slate-400 font-sans">Trucks</span>
              </div>
            </div>
            <div className="w-7 h-7 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
            <span className="text-xs text-amber-700 font-medium">Can ship short with confirmation</span>
            <span className="text-[11px] text-slate-400">Staging</span>
          </div>
        </div>

        {/* Card 4: White Pill Card - Total Pending Trucks */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                Pending Fleet
              </span>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-1 font-mono">
                {batches.length} <span className="text-sm font-semibold text-slate-400 font-sans">Loads</span>
              </div>
            </div>
            <div className="w-7 h-7 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600">
              <Truck className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-500">Awaiting weighbridge & gate pass</span>
            <span className="text-[11px] font-bold text-slate-700">Active</span>
          </div>
        </div>
      </div>

      {/* 3. BATCHES QUEUE CARDS */}
      {batches.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
          <Truck className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-bold text-slate-800 text-sm">No Pending Loads Ready to Dispatch</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            All planned truck loads have already been dispatched. Build new loads from confirmed orders in Load Planning.
          </p>
          <Button asChild size="sm" className="mt-4 rounded-xl bg-[#161622] hover:bg-[#202030] text-white font-bold text-xs shadow-xs">
            <Link href="/loads/new">Plan Truck Load</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {batches.map((batch) => {
            const isReady = batch.readinessStatus === "READY";
            const isPartial = batch.readinessStatus === "PARTIAL";

            return (
              <div
                key={batch.id}
                className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] hover:shadow-md transition-all flex flex-col justify-between space-y-4"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                  <div>
                    <div className="font-mono font-black text-slate-900 text-base">
                      {batch.batchNumber}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {batch.truckNumber} • {batch.transporterName || "Fleet"}
                    </div>
                  </div>

                  {isReady ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="h-3 w-3" /> Ready
                    </span>
                  ) : isPartial ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      <AlertTriangle className="h-3 w-3" /> Partial
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      Not Produced
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Total Planned:</span>
                    <strong className="text-slate-900 font-mono">{formatWeightKg(batch.totalPlannedKg)}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Truck Capacity:</span>
                    <span className="text-slate-700 font-mono">{formatWeightKg(batch.truckCapacityKg)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Driver:</span>
                    <span className="text-slate-800">{batch.driverName || "Assigned Driver"}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Clients Onboard:</span>
                    <span className="font-bold text-sky-600">{batch.clients.length} Customers</span>
                  </div>
                </div>

                {/* Short items warning */}
                {batch.shortItems && batch.shortItems.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-[11px] text-amber-800 space-y-1">
                    <strong>Shortfall ({batch.shortItems.length} items):</strong>
                    {batch.shortItems.slice(0, 2).map((s, idx) => (
                      <div key={idx} className="font-mono text-[10px]">
                        • {s.orderNumber} ({s.widthInch}&quot;): Short {s.shortKg.toLocaleString()} kg
                      </div>
                    ))}
                  </div>
                )}

                {/* Button */}
                <Button asChild className="w-full h-10 rounded-xl bg-[#161622] hover:bg-[#202030] text-white font-bold text-xs shadow-xs gap-1.5 transition-all">
                  <Link href={`/dispatch/${batch.id}`}>
                    <FileText className="h-4 w-4" /> Open Loading Sheet & Gate Pass
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
