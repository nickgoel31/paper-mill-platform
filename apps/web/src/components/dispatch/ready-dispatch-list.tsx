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
          <Button asChild className="h-10 px-5 rounded-xl bg-sky-400 hover:bg-sky-500 text-white font-bold text-xs gap-1.5 shadow-md shadow-sky-400/25 transition-all">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. TOTAL PENDING TRUCKS */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              PENDING TRUCKS
            </span>
            <div className="h-8 w-8 rounded-xl bg-sky-50 text-sky-500 flex items-center justify-center">
              <Truck className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-900">
              {batches.length} <span className="text-sm font-semibold text-slate-400 font-sans">Loads</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Awaiting gate pass departure
            </p>
          </div>
        </div>

        {/* 2. 100% READY */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              READY FOR LOADING
            </span>
            <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-emerald-700">
              {readyCount} <span className="text-sm font-semibold text-slate-400 font-sans">Trucks</span>
            </div>
            <p className="text-[11px] text-emerald-700 font-bold mt-1">
              100% produced and in stock
            </p>
          </div>
        </div>

        {/* 3. PARTIAL / SHORT */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              PARTIAL PRODUCTION
            </span>
            <div className="h-8 w-8 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-amber-800">
              {partialCount} <span className="text-sm font-semibold text-slate-400 font-sans">Trucks</span>
            </div>
            <p className="text-[11px] text-amber-700 font-medium mt-1">
              Can ship short with confirmation
            </p>
          </div>
        </div>

        {/* 4. TOTAL MANIFEST WEIGHT */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              TOTAL MANIFEST WT
            </span>
            <div className="h-8 w-8 rounded-xl bg-purple-50 text-purple-500 flex items-center justify-center">
              <PackageCheck className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-900">
              {(totalWeight / 1000).toFixed(1)} <span className="text-sm font-semibold text-slate-400 font-sans">MT</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              {formatWeightKg(totalWeight)} planned
            </p>
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
          <Button asChild size="sm" className="mt-4 rounded-xl bg-sky-400 hover:bg-sky-500 font-bold text-xs">
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
                <Button asChild className="w-full h-10 rounded-xl bg-sky-400 hover:bg-sky-500 text-white font-bold text-xs shadow-xs gap-1.5">
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
