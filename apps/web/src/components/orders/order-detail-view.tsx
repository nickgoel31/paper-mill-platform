"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OrderStatus, OrderPriority, Role } from "@/generated/prisma/browser";
import { PAPER_TYPE_LABELS } from "@/lib/paper-type";
import { PAPER_SIZE_LABELS } from "@/lib/paper-size";
import { formatWeightKg, formatCurrencyINR, formatWidthInch, formatOrderAge } from "@/lib/utils";
import { transitionOrderStatus } from "@/server/services/order-service";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Pencil,
  CheckCircle2,
  XCircle,
  Truck,
  Scissors,
  Clock,
  History,
  FileText,
  Building2,
  Calendar,
  Layers,
  AlertCircle,
  Loader2,
  ShoppingCart,
  Send,
  Sparkles,
  Phone,
  MessageSquare,
  MapPin,
  Check,
} from "lucide-react";

interface OrderDetailViewProps {
  order: any;
  userRole: Role;
  displayUnit?: "INCH" | "CM";
}

export function OrderDetailView({ order, userRole, displayUnit = "INCH" }: OrderDetailViewProps) {
  const router = useRouter();
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  const [cancelModalOpen, setCancelModalOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");

  const isSalesOrAdmin = userRole === Role.ADMIN || userRole === Role.SALES;
  const isPlannerOrAdmin = userRole === Role.ADMIN || userRole === Role.PLANNER;

  const totalKg = order.items.reduce(
    (acc: number, it: any) => acc + Number(it.quantityKg || 0),
    0
  );
  const producedKg = order.items.reduce(
    (acc: number, it: any) => acc + Number(it.producedKg || 0),
    0
  );
  const dispatchedKg = order.items.reduce(
    (acc: number, it: any) => acc + Number(it.dispatchedKg || 0),
    0
  );
  const totalValue = order.items.reduce(
    (acc: number, it: any) =>
      acc + Number(it.quantityKg || 0) * (Number(it.ratePerKg) || 0),
    0
  );
  const percentProduced =
    totalKg > 0 ? Math.min(100, Math.round((producedKg / totalKg) * 100)) : 0;
  const percentDispatched =
    totalKg > 0 ? Math.min(100, Math.round((dispatchedKg / totalKg) * 100)) : 0;

  const handleStatusChange = async (newStatus: OrderStatus, reason?: string) => {
    setIsTransitioning(true);
    try {
      const result = await transitionOrderStatus({
        orderId: order.id,
        newStatus,
        reason,
      });
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Order #${order.orderNumber} transitioned to ${newStatus}.`);
      setCancelModalOpen(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to transition status");
    } finally {
      setIsTransitioning(false);
    }
  };

  const isEditable =
    isSalesOrAdmin &&
    (order.status === OrderStatus.DRAFT || order.status === OrderStatus.CONFIRMED);

  // Status Badge Component
  const renderStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.CONFIRMED:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            CONFIRMED
          </span>
        );
      case OrderStatus.PLANNED:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
            <span className="h-2 w-2 rounded-full bg-purple-500" />
            PLANNED
          </span>
        );
      case OrderStatus.IN_PRODUCTION:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            IN PRODUCTION
          </span>
        );
      case OrderStatus.PRODUCED:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            PRODUCED
          </span>
        );
      case OrderStatus.DISPATCHED:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            <span className="h-2 w-2 rounded-full bg-slate-500" />
            DISPATCHED
          </span>
        );
      case OrderStatus.CANCELLED:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
            CANCELLED
          </span>
        );
      case OrderStatus.DRAFT:
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            DRAFT
          </span>
        );
    }
  };

  const deliveryDateObj = order.deliveryDate ? new Date(order.deliveryDate) : null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const isOverdue = deliveryDateObj && deliveryDateObj < now && order.status !== OrderStatus.DISPATCHED;

  return (
    <div className="space-y-6 font-sans pb-10">
      {/* 1. TOP HERO BANNER */}
      <div className="bg-white rounded-[26px] p-6 sm:p-7 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs px-2 text-slate-500 hover:text-slate-900 rounded-lg">
              <Link href="/orders">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Orders
              </Link>
            </Button>
            <span className="text-slate-300">•</span>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[10px] font-mono font-bold uppercase">
              ORDER #{order.orderNumber}
            </div>
            {order.priority === "URGENT" && (
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 uppercase">
                URGENT
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-mono">
              {order.orderNumber}
            </h1>
            {renderStatusBadge(order.status)}
            {order.items.some((it: any) => it.isBookingOnly) && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                BOOKING
              </span>
            )}
          </div>

          <p className="text-xs text-slate-500 font-medium">
            Customer: <strong className="text-slate-900">{order.client.name}</strong> ({order.client.city}, {order.client.state}) • Booked on {new Date(order.orderDate).toLocaleDateString("en-IN")}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {isEditable && (
            <Button asChild variant="outline" className="h-10 px-4 rounded-xl border-slate-200 text-slate-700 text-xs font-bold shadow-xs">
              <Link href={`/orders/${order.id}/edit`}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit Order
              </Link>
            </Button>
          )}

          {isPlannerOrAdmin && order.status === OrderStatus.CONFIRMED && (
            <Button asChild className="h-10 px-5 rounded-xl bg-[#161622] hover:bg-[#202030] text-white font-bold text-xs shadow-sm gap-1.5 transition-all">
              <Link href="/deckle">
                <Scissors className="h-4 w-4 stroke-[2.5]" /> Plan in Deckle Optimizer
              </Link>
            </Button>
          )}

          {isPlannerOrAdmin && order.status === OrderStatus.IN_PRODUCTION && (
            <>
              <Button
                onClick={() => handleStatusChange(OrderStatus.PRODUCED)}
                disabled={isTransitioning}
                className="h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm gap-1.5"
              >
                {isTransitioning ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                )}
                Mark as Produced (Ready for Dispatch)
              </Button>

              <Button
                variant="outline"
                onClick={() => handleStatusChange(OrderStatus.CONFIRMED)}
                disabled={isTransitioning}
                className="h-10 px-4 rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50 font-bold text-xs shadow-xs"
              >
                Revert to Confirmed
              </Button>
            </>
          )}

          {isPlannerOrAdmin && (order.status === OrderStatus.CONFIRMED || order.status === OrderStatus.IN_PRODUCTION || order.status === OrderStatus.PRODUCED) && (
            <Button asChild variant="outline" className="h-10 px-4 rounded-xl border-slate-200 text-slate-700 text-xs font-bold shadow-xs">
              <Link href="/loads/new">
                <Truck className="h-4 w-4 mr-1.5 text-sky-500" /> Build Truck Load
              </Link>
            </Button>
          )}

          {isSalesOrAdmin && order.status === OrderStatus.DRAFT && (
            <Button
              onClick={() => handleStatusChange(OrderStatus.CONFIRMED)}
              disabled={isTransitioning}
              className="h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
            >
              {isTransitioning ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
              Confirm Order
            </Button>
          )}

          {isSalesOrAdmin && order.status !== OrderStatus.CANCELLED && order.status !== OrderStatus.DISPATCHED && (
            <Button
              variant="outline"
              onClick={() => setCancelModalOpen(true)}
              className="h-10 px-3.5 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold shadow-xs"
            >
              <XCircle className="h-4 w-4 mr-1" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {/* 2. 4 PERFORMANCE METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* 1. ORDERED WEIGHT (Hero Dark Card) */}
        <div className="relative overflow-hidden rounded-[26px] bg-[#161622] text-white p-6 shadow-xl flex flex-col justify-between min-h-[160px]">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#d4f842]/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Ordered Weight</span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#d4f842] text-black text-[11px] font-bold shadow-sm">
              <span>Demand</span>
              <ShoppingCart className="h-3 w-3" />
            </div>
          </div>
          <div className="space-y-1 mt-3">
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight">
              {(totalKg / 1000).toFixed(2)}{" "}
              <span className="text-sm font-semibold text-slate-400 font-sans">MT</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              {formatWeightKg(totalKg)} across {order.items.length} sizes
            </p>
          </div>
        </div>

        {/* 2. PRODUCED PROGRESS */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Production Progress</span>
            <div className="h-8 w-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="space-y-1.5 mt-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-700 tracking-tight">
                {percentProduced}%
              </span>
              <span className="text-xs font-mono text-slate-400 font-medium">
                ({(producedKg / 1000).toFixed(2)} MT)
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all"
                style={{ width: `${percentProduced}%` }}
              />
            </div>
          </div>
        </div>

        {/* 3. DISPATCHED QUANTITY */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Dispatched</span>
            <div className="h-8 w-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
              <Send className="h-4 w-4" />
            </div>
          </div>
          <div className="space-y-1 mt-3">
            <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 tracking-tight">
              {(dispatchedKg / 1000).toFixed(2)}{" "}
              <span className="text-sm font-semibold text-slate-400 font-sans">MT</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              {percentDispatched}% of total shipment
            </p>
          </div>
        </div>

        {/* 4. GROSS TAXABLE VALUE */}
        <div className="relative overflow-hidden rounded-[26px] bg-white border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Taxable Value</span>
            <div className="h-8 w-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <div className="space-y-1 mt-3">
            <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 tracking-tight">
              {formatCurrencyINR(totalValue)}
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Billing rate + GST applicable
            </p>
          </div>
        </div>
      </div>

      {/* 3. CLIENT & SHIPPING SPECIFICATIONS CARD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Client Profile & Commercial Terms */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-sky-500" /> Customer Commercial Profile
            </h2>
            <span className="text-[11px] font-mono text-slate-400">
              GST Code: {order.client.gstin?.substring(0, 2) || "07"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">BILL TO CUSTOMER</span>
              <strong className="text-sm font-bold text-slate-900 block mt-0.5">{order.client.name}</strong>
              <p className="text-slate-500 text-[11px] leading-relaxed mt-1">
                {order.client.addressLine1}
                {order.client.addressLine2 && `, ${order.client.addressLine2}`}, {order.client.city}, {order.client.state} - {order.client.pincode}
              </p>
            </div>

            <div className="space-y-1.5 font-mono text-[11px]">
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400 font-sans">GSTIN:</span>
                <strong className="text-slate-900">{order.client.gstin || "N/A"}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400 font-sans">Phone / WhatsApp:</span>
                <span className="text-sky-600 font-bold">{order.client.whatsappNumber}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400 font-sans">Contact Person:</span>
                <span className="text-slate-800">{order.client.contactPerson || "Purchase Desk"}</span>
              </div>
            </div>
          </div>

          {order.notes && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600 space-y-1">
              <strong className="text-slate-900 font-bold block text-[11px]">Commercial & Shipping Notes:</strong>
              <p className="text-[11px] leading-relaxed">{order.notes}</p>
            </div>
          )}

          {order.otherNotes && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600 space-y-1">
              <strong className="text-slate-900 font-bold block text-[11px]">Other Notes:</strong>
              <p className="text-[11px] leading-relaxed whitespace-pre-wrap">{order.otherNotes}</p>
            </div>
          )}
        </div>

        {/* Right 1 Col: Delivery Schedule */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-amber-500" /> Delivery Target
            </h2>
            {isOverdue ? (
              <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                OVERDUE
              </span>
            ) : deliveryDateObj ? (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                ON SCHEDULE
              </span>
            ) : (
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                NO DATE SET
              </span>
            )}
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">PROMISED DELIVERY DUE DATE</span>
              <div className={deliveryDateObj ? "text-xl font-black font-mono text-slate-900 mt-0.5" : "text-sm font-bold text-slate-400 italic mt-0.5"}>
                {deliveryDateObj ? deliveryDateObj.toLocaleDateString("en-IN") : formatOrderAge(order.orderDate)}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Order Booking:</span>
                <span className="font-mono font-bold text-slate-800">
                  {new Date(order.orderDate).toLocaleDateString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Truck Load:</span>
                <span className="font-mono text-slate-800">
                  {order.loadAssignments?.length > 0 ? "Assigned" : "Unassigned"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. REEL DEMAND SLIT SPECIFICATIONS TABLE */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-500" /> Reel Line Items & Slitting Demand ({order.items.length} Sizes)
            </h2>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              Exact slit sizes in inches, paper GSM quality, demanded weights, and production fulfillment.
            </p>
          </div>

          <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
            Total: {formatWeightKg(totalKg)}
          </span>
        </div>

        <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-50/70">
            <TableRow>
              <TableHead className="w-12 text-center text-[10px] font-bold font-mono">#</TableHead>
              <TableHead className="text-[11px] font-bold uppercase text-slate-500">Width (Inches)</TableHead>
              <TableHead className="text-[11px] font-bold uppercase text-slate-500">Quality (GSM)</TableHead>
              <TableHead className="text-[11px] font-bold uppercase text-slate-500">Paper Type</TableHead>
              <TableHead className="text-[11px] font-bold uppercase text-slate-500">Size</TableHead>
              <TableHead className="text-right text-[11px] font-bold uppercase text-slate-500">Reels</TableHead>
              <TableHead className="text-right text-[11px] font-bold uppercase text-slate-500">Ordered Qty</TableHead>
              <TableHead className="text-right text-[11px] font-bold uppercase text-slate-500">Produced</TableHead>
              <TableHead className="text-right text-[11px] font-bold uppercase text-slate-500">Dispatched</TableHead>
              <TableHead className="text-[11px] font-bold uppercase text-slate-500">Tolerance</TableHead>
              <TableHead className="text-right text-[11px] font-bold uppercase text-slate-500">Rate / KG</TableHead>
              <TableHead className="text-right text-[11px] font-bold uppercase text-slate-500">Total (₹)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.items.map((it: any, idx: number) => {
              const reqKg = Number(it.quantityKg || 0);
              const prodKg = Number(it.producedKg || 0);
              const dispKg = Number(it.dispatchedKg || 0);
              const rate = Number(it.ratePerKg || 0);
              const lineTotal = reqKg * rate;
              const isFulfilled = prodKg >= reqKg * 0.95;

              if (it.isBookingOnly) {
                return (
                  <TableRow key={it.id} className="hover:bg-amber-50/40 bg-amber-50/20 text-xs">
                    <TableCell className="text-center font-mono font-bold text-slate-400">
                      {idx + 1}
                    </TableCell>
                    <TableCell colSpan={5} className="text-[11px]">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold text-[10px] uppercase">
                        Booking Only — no size/reel yet
                      </span>
                      {it.remark && (
                        <span className="block font-sans font-normal text-[10px] text-slate-400 mt-1 max-w-[280px] truncate" title={it.remark}>
                          {it.remark}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-slate-900">
                      {formatWeightKg(reqKg)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      <span className={isFulfilled ? "text-emerald-600" : "text-amber-600"}>
                        {formatWeightKg(prodKg)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-slate-700">
                      {formatWeightKg(dispKg)}
                    </TableCell>
                    <TableCell className="font-mono text-slate-500 text-[11px]">
                      ±{Number(it.tolerancePercent || 5).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right font-mono text-slate-700">
                      {rate > 0 ? `₹${rate.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-slate-900">
                      {lineTotal > 0 ? formatCurrencyINR(lineTotal) : "—"}
                    </TableCell>
                  </TableRow>
                );
              }

              return (
                <TableRow key={it.id} className="hover:bg-slate-50/50 text-xs">
                  <TableCell className="text-center font-mono font-bold text-slate-400">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="font-mono font-black text-slate-900 text-sm">
                    {formatWidthInch(it.widthInch, displayUnit)}
                    {it.remark && (
                      <span className="block font-sans font-normal text-[10px] text-slate-400 mt-0.5 max-w-[180px] truncate" title={it.remark}>
                        {it.remark}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-mono font-bold text-[10px]">
                      {it.gsm} GSM
                    </span>
                    {it.bf ? (
                      <span className="block text-[9px] text-slate-400 font-mono mt-0.5">{it.bf} BF</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-[11px] font-semibold text-slate-700">
                    {PAPER_TYPE_LABELS[it.paperType] ?? it.paperType}
                  </TableCell>
                  <TableCell className="text-[11px] font-semibold text-slate-700">
                    {PAPER_SIZE_LABELS[it.size as keyof typeof PAPER_SIZE_LABELS] ?? it.size ?? "Normal"}
                    {it.kgPerInchOverride && (
                      <span
                        className="block text-[9px] font-bold text-amber-700 mt-0.5"
                        title={`This line uses ${Number(it.kgPerInchOverride)} kg/inch instead of the mill's GSM chart default.`}
                      >
                        {Number(it.kgPerInchOverride)} kg/in override
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-slate-700">
                    {it.numberOfReels ? `${it.numberOfReels}` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-slate-900">
                    {formatWeightKg(reqKg)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">
                    <span className={isFulfilled ? "text-emerald-600" : "text-amber-600"}>
                      {formatWeightKg(prodKg)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-slate-700">
                    {formatWeightKg(dispKg)}
                  </TableCell>
                  <TableCell className="font-mono text-slate-500 text-[11px]">
                    ±{Number(it.tolerancePercent || 5).toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right font-mono text-slate-700">
                    {rate > 0 ? `₹${rate.toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-slate-900">
                    {lineTotal > 0 ? formatCurrencyINR(lineTotal) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </div>

      {/* 5. CANCELLATION MODAL */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-600">
              Cancel Order #{order.orderNumber}?
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Cancelling this order will release its unassigned line items from the deckle optimization pool and notify commercial teams.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label className="text-xs font-bold text-slate-700 block">Cancellation Reason *</label>
            <Input
              placeholder="e.g. Client requested cancellation / Credit hold"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="text-xs rounded-xl"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCancelModalOpen(false)} className="rounded-xl">
              Keep Order
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!cancelReason.trim() || isTransitioning}
              onClick={() => handleStatusChange(OrderStatus.CANCELLED, cancelReason)}
              className="rounded-xl font-bold"
            >
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
