"use client";

import * as React from "react";
import Link from "next/link";
import {
  FileText,
  Scissors,
  Package,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  ExternalLink,
  Factory,
  Truck,
  Building2,
  Calendar,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatWeightKg, formatWidthInch, formatTrimPercent } from "@/lib/utils";

/** Coerce anything to a finite number; never throws on undefined/null/NaN. */
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Error boundary for agent result cards. The AI assistant is mounted in the
 * dashboard layout, so a bad card must never take down the whole page — it
 * renders nothing instead.
 */
export class AgentCardBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("[AgentCardBoundary] card render failed", err);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// -----------------------------------------------------------------------------
// 1. ORDERS CARD COMPONENT
// -----------------------------------------------------------------------------
export interface OrderCardData {
  id: string;
  orderNumber: string;
  client: string;
  city?: string;
  status: string;
  priority: string;
  totalKg: number;
  deliveryDate?: string | Date | null;
  items?: Array<{
    widthInch: number;
    gsm: number;
    quantityKg: number;
    ratePerKg?: number | null;
  }>;
}

export function AgentOrdersCard({ orders }: { orders: OrderCardData[] }) {
  if (!orders || orders.length === 0) return null;

  return (
    <div className="my-2.5 space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-sky-500" />
          Sales Orders ({orders.length})
        </span>
        <Link
          href="/orders"
          className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-0.5"
        >
          View All <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {orders.map((order) => {
          const isUrgent = order.priority === "URGENT";
          return (
            <div
              key={order.id || order.orderNumber}
              className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-sm hover:border-sky-300 hover:shadow-md transition-all space-y-2"
            >
              {/* Top line */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-sky-600">
                      {order.orderNumber}
                    </span>
                    <Badge
                      className={`text-[10px] px-2 py-0 font-bold ${
                        isUrgent
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {order.priority}
                    </Badge>
                    <Badge
                      className={`text-[10px] px-2 py-0 font-bold ${
                        order.status === "CONFIRMED"
                          ? "bg-sky-50 text-sky-700 border-sky-200"
                          : order.status === "PRODUCED"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                    >
                      {order.status}
                    </Badge>
                  </div>
                  <h4 className="font-bold text-xs text-slate-900 mt-1">{order.client}</h4>
                  {order.city && (
                    <span className="text-[10px] text-slate-400 font-mono">📍 {order.city}</span>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block font-medium">TOTAL WEIGHT</span>
                  <span className="font-mono font-black text-xs text-slate-900">
                    {(num(order.totalKg) / 1000).toFixed(3)} MT
                  </span>
                  <span className="text-[10px] text-slate-500 block font-mono">
                    ({num(order.totalKg).toLocaleString("en-IN")} kg)
                  </span>
                </div>
              </div>

              {/* Items chips */}
              {order.items && order.items.length > 0 && (
                <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                  {order.items.slice(0, 6).map((it, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-50 border border-slate-200/60 rounded-md px-2 py-0.5 text-[10px] font-mono text-slate-700"
                    >
                      <strong>{it.widthInch}&quot;</strong> {it.gsm}G • {it.quantityKg}kg
                    </div>
                  ))}
                  {order.items.length > 6 && (
                    <span className="text-[10px] font-mono text-slate-400 self-center">
                      +{order.items.length - 6} more
                    </span>
                  )}
                </div>
              )}

              {/* Action link */}
              <div className="pt-1 flex items-center justify-between text-[11px]">
                <Link
                  href={`/orders/${order.id}`}
                  className="text-sky-600 hover:underline font-semibold flex items-center gap-1"
                >
                  Order Details <ExternalLink className="h-3 w-3" />
                </Link>
                <Link
                  href="/deckle"
                  className="text-emerald-600 hover:underline font-semibold flex items-center gap-1"
                >
                  <Scissors className="h-3 w-3" /> Optimize in Deckle
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 2. STOCK / INVENTORY REELS CARD
// -----------------------------------------------------------------------------
export interface StockCardData {
  id: string;
  widthInch: number;
  gsm: number;
  quantityKg: number;
  status: string;
  location?: string;
  allocatedOrder?: string | null;
  client?: string | null;
}

export function AgentStockCard({ items }: { items: StockCardData[] }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="my-2.5 space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5 text-emerald-500" />
          Warehouse Reels ({items.length})
        </span>
        <Link
          href="/inventory"
          className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5"
        >
          View Inventory <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] text-left">
            <thead className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-100">
              <tr>
                <th className="p-2">Width</th>
                <th className="p-2">GSM</th>
                <th className="p-2 text-right">Weight</th>
                <th className="p-2">Status</th>
                <th className="p-2">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.slice(0, 8).map((item, idx) => (
                <tr key={item.id || idx} className="hover:bg-slate-50/50">
                  <td className="p-2 font-mono font-bold text-slate-900">
                    {formatWidthInch(item.widthInch)}
                  </td>
                  <td className="p-2 font-mono text-slate-600">{item.gsm} GSM</td>
                  <td className="p-2 text-right font-mono font-bold text-slate-900">
                    {num(item.quantityKg).toFixed(1)} kg
                  </td>
                  <td className="p-2">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                        item.status === "AVAILABLE"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : item.status === "ALLOCATED"
                          ? "bg-sky-50 text-sky-700 border border-sky-200"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="p-2 font-mono text-[10px] text-slate-400">
                    {item.location || "BAY-A"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 3. PRODUCTION RUNS CARD
// -----------------------------------------------------------------------------
export interface ProductionRunCardData {
  id: string;
  runNumber: string;
  machine: string;
  gsm: number;
  trimPercent: number;
  plannedKg: number;
  status: string;
  patternsCount?: number;
}

export function AgentProductionRunsCard({ runs }: { runs: ProductionRunCardData[] }) {
  if (!runs || runs.length === 0) return null;

  return (
    <div className="my-2.5 space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Factory className="h-3.5 w-3.5 text-indigo-500" />
          Production Runs ({runs.length})
        </span>
        <Link
          href="/production"
          className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5"
        >
          View Runs <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {runs.map((r) => (
          <div
            key={r.id || r.runNumber}
            className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-sm hover:border-indigo-300 transition-all space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs text-indigo-600">
                  {r.runNumber}
                </span>
                <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-mono font-bold text-slate-700">
                  {r.gsm} GSM
                </span>
              </div>
              <Badge
                className={`text-[10px] px-2 py-0 font-bold ${
                  r.status === "RUNNING"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : r.status === "COMPLETED"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-amber-50 text-amber-700 border-amber-200"
                }`}
              >
                {r.status}
              </Badge>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">MACHINE</span>
                <span className="font-bold text-slate-800">{r.machine}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">TRIM LOSS</span>
                <span className="font-mono font-bold text-emerald-600">{r.trimPercent}%</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-medium">OUTPUT</span>
                <span className="font-mono font-bold text-slate-900">
                  {(num(r.plannedKg) / 1000).toFixed(2)} MT
                </span>
              </div>
            </div>

            <div className="pt-1 border-t border-slate-100 flex items-center justify-end">
              <Link
                href={`/production/${r.id}`}
                className="text-[11px] text-indigo-600 hover:underline font-semibold flex items-center gap-1"
              >
                Open Run Card <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
