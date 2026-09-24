"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoadStatus, OrderStatus, Role } from "@/generated/prisma/browser";
import { formatWeightKg } from "@/lib/utils";
import {
  markBatchPlanned,
  revertBatchToDraft,
  cancelLoadBatch,
} from "@/server/services/load-batch-service";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  Truck,
  Building,
  Calendar,
  CheckCircle2,
  XCircle,
  MessageSquare,
  History,
  Phone,
  User,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from "lucide-react";

interface LoadDetailViewProps {
  batch: any;
  userRole: Role;
}

export function LoadDetailView({ batch, userRole }: LoadDetailViewProps) {
  const router = useRouter();
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  const [cancelModalOpen, setCancelModalOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");

  const canManage =
    userRole === Role.ADMIN || userRole === Role.PLANNER || userRole === Role.SALES;

  const totalKg = Number(batch.totalPlannedKg) || 0;
  const truckCapacity = batch.truck?.capacityKg || 0;
  const capacityPct =
    truckCapacity > 0 ? Math.round((totalKg / truckCapacity) * 100) : 0;

  const handleMarkPlanned = async () => {
    setIsTransitioning(true);
    try {
      const result = await markBatchPlanned(batch.id);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Load Batch #${batch.batchNumber} marked as PLANNED. All ${batch.orders.length} assigned orders flipped to PLANNED.`
      );
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to mark batch as planned");
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleRevertDraft = async () => {
    setIsTransitioning(true);
    try {
      const result = await revertBatchToDraft(batch.id);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Load Batch #${batch.batchNumber} reverted to DRAFT. Assigned orders reverted to CONFIRMED.`
      );
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to revert batch to draft");
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleConfirmCancel = async () => {
    setIsTransitioning(true);
    try {
      const result = await cancelLoadBatch(batch.id, cancelReason);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Load Batch #${batch.batchNumber} cancelled. Assigned orders reverted to CONFIRMED.`
      );
      setCancelModalOpen(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel batch");
    } finally {
      setIsTransitioning(false);
    }
  };

  // Distinct clients for WhatsApp fanout
  const distinctClientCount = new Set(batch.orders.map((o: any) => o.order.client.id)).size;

  return (
    <div className="space-y-6">
      {/* Header & Status Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 bg-white p-6 sm:p-7 rounded-[26px] border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs px-2 text-slate-500 hover:text-slate-900 rounded-lg">
              <Link href="/loads">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Load Batches
              </Link>
            </Button>
            <span className="text-slate-300">•</span>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[10px] font-mono font-bold uppercase">
              BATCH #{batch.batchNumber}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black font-mono text-slate-900 tracking-tight">
              {batch.batchNumber}
            </h1>
            <Badge
              className={`font-mono text-xs ${
                batch.status === LoadStatus.PLANNED
                  ? "bg-blue-100 text-blue-800 border-blue-300"
                  : batch.status === LoadStatus.DISPATCHED
                  ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                  : batch.status === LoadStatus.CANCELLED
                  ? "bg-red-100 text-red-800 border-red-300"
                  : ""
              }`}
            >
              {batch.status}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Created by {batch.createdBy?.name || "Planner"} • {new Date(batch.createdAt).toLocaleString("en-IN")}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {batch.status === LoadStatus.DRAFT && canManage && (
            <Button
              size="sm"
              disabled={isTransitioning}
              onClick={handleMarkPlanned}
              className="h-10 px-5 rounded-xl bg-[#161622] hover:bg-[#202030] text-white font-bold text-xs shadow-sm gap-1.5 transition-all"
            >
              {isTransitioning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Mark Batch as Planned
            </Button>
          )}

          {batch.status === LoadStatus.PLANNED && canManage && (
            <Button
              variant="outline"
              size="sm"
              disabled={isTransitioning}
              onClick={handleRevertDraft}
              className="h-10 px-4 rounded-xl border-slate-200 text-slate-700 font-bold text-xs shadow-xs gap-1.5"
            >
              Revert to Draft
            </Button>
          )}

          {batch.status !== LoadStatus.DISPATCHED &&
            batch.status !== LoadStatus.DELIVERED &&
            batch.status !== LoadStatus.CANCELLED &&
            canManage && (
              <Button
                variant="outline"
                size="sm"
                disabled={isTransitioning}
                onClick={() => setCancelModalOpen(true)}
                className="h-10 px-4 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold shadow-xs gap-1.5"
              >
                <XCircle className="h-4 w-4" /> Cancel Batch
              </Button>
            )}
        </div>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Vehicle & Payload Card */}
        <Card className="rounded-[26px] border border-slate-100 shadow-sm bg-white overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-primary" /> Vehicle & Payload
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Truck Registration:</span>
              <span className="font-mono font-bold bg-slate-100 px-2 py-0.5 rounded border">
                {batch.truck?.registrationNumber || "Unassigned"}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between font-mono">
                <span className="text-muted-foreground">Utilisation:</span>
                <span className="font-bold">
                  {formatWeightKg(totalKg)} / {formatWeightKg(truckCapacity)} ({capacityPct}%)
                </span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border">
                <div
                  style={{ width: `${Math.min(100, capacityPct)}%` }}
                  className={`h-full ${
                    capacityPct >= 90
                      ? "bg-emerald-500"
                      : capacityPct >= 70
                      ? "bg-amber-500"
                      : "bg-blue-600"
                  }`}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transport & Driver Card */}
        <Card className="rounded-[26px] border border-slate-100 shadow-sm bg-white overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
              <Building className="h-4 w-4 text-sky-500" /> Transporter & Driver
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between py-0.5 border-b">
              <span className="text-muted-foreground">Agency:</span>
              <span className="font-semibold">{batch.transporter?.name || "Direct Freight"}</span>
            </div>
            <div className="flex justify-between py-0.5 border-b">
              <span className="text-muted-foreground">Driver:</span>
              <span>{batch.driverName || "Not assigned"}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">Driver Phone:</span>
              <span className="font-mono">{batch.driverPhone || "—"}</span>
            </div>
          </CardContent>
        </Card>

        {/* Dispatch & WhatsApp Fanout Card */}
        <Card className="rounded-[26px] border border-slate-100 shadow-sm bg-white overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4 text-emerald-600" /> WhatsApp Fanout (Rule E)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between py-0.5 border-b">
              <span className="text-muted-foreground">Planned Dispatch:</span>
              <span className="font-mono font-bold">
                {batch.plannedDispatchDate
                  ? new Date(batch.plannedDispatchDate).toLocaleDateString("en-IN")
                  : "Open"}
              </span>
            </div>
            <div className="flex justify-between py-0.5 border-b">
              <span className="text-muted-foreground">Fanout Recipients:</span>
              <span className="font-bold text-emerald-700">
                {distinctClientCount} Clients ({batch.orders.length} Orders)
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground pt-1">
              One dispatch event will auto-send WhatsApp notifications to every client on this truck.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table with WhatsApp Notification Preview */}
      <Card className="rounded-[26px] border border-slate-100 shadow-sm bg-white overflow-hidden">
        <CardHeader className="pb-3 border-b bg-slate-50/50">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Consolidated Orders on this Truck ({batch.orders.length})
          </CardTitle>
          <CardDescription className="text-xs">
            Every client listed below will receive an automated WhatsApp dispatch notification with vehicle and gate pass details.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-100/70">
                <TableHead className="w-[50px] text-center">#</TableHead>
                <TableHead>Order No.</TableHead>
                <TableHead>Client & Destination</TableHead>
                <TableHead>Order Status</TableHead>
                <TableHead>WhatsApp Notification Preview (Rule E)</TableHead>
                <TableHead className="text-right">Ordered Weight</TableHead>
                <TableHead className="w-[60px] text-center"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batch.orders.map((bo: any, idx: number) => {
                const order = bo.order;
                const orderTotalKg = order.items.reduce(
                  (acc: number, it: any) => acc + Number(it.quantityKg || 0),
                  0
                );

                return (
                  <TableRow key={bo.id}>
                    <TableCell className="text-center font-mono text-xs text-muted-foreground">
                      {idx + 1}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/orders/${order.id}`}
                        className="font-mono font-bold text-primary hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-slate-900">{order.client.name}</div>
                      <div className="text-[11px] font-mono text-muted-foreground">
                        {order.client.city}, {order.client.state}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`font-mono text-[10px] ${
                          order.status === OrderStatus.PLANNED
                            ? "bg-blue-50 text-blue-800 border-blue-200"
                            : ""
                        }`}
                      >
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 inline-flex">
                        <MessageSquare className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span>+{order.client.whatsappNumber}</span>
                        <span className="text-[10px] text-emerald-600 font-sans">
                          ({order.client.contactPerson || "Client Dispatch"})
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-slate-900">
                      {formatWeightKg(orderTotalKg)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                        <Link href={`/orders/${order.id}`}>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Table Footer */}
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between font-mono text-xs">
            <div>
              <span className="text-slate-400 text-[10px] block font-sans">CONSOLIDATED BATCH LOAD</span>
              <strong className="text-base text-amber-400">{formatWeightKg(totalKg)}</strong>
            </div>
            <div className="text-right text-slate-400 font-sans text-xs">
              {batch.notes ? `Remarks: "${batch.notes}"` : "Single-trip consolidated freight"}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AuditLog Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Batch History & Audit Logs ({batch.auditLogs?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {batch.auditLogs && batch.auditLogs.length > 0 ? (
            <div className="space-y-4 pl-2 border-l-2 border-slate-200">
              {batch.auditLogs.map((log: any) => (
                <div key={log.id} className="relative pl-6 space-y-1">
                  <div className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full bg-primary border-2 border-white shadow" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">{log.action}</span>
                    <span className="font-mono text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Action by <strong>{log.user?.name || "Staff"}</strong> ({log.user?.role || "Staff"})
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No audit logs recorded yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Cancel Dialog */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle className="text-base font-bold">
                Cancel Load Batch #{batch.batchNumber}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Cancelling this batch will revert all {batch.orders.length} assigned orders back to
              CONFIRMED status so they can be re-assigned.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label className="text-xs font-semibold">Cancellation Reason (Optional)</label>
            <Input
              placeholder="e.g. Truck unavailable, rescheduling route"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isTransitioning}
              onClick={() => setCancelModalOpen(false)}
            >
              Keep Batch
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isTransitioning}
              onClick={handleConfirmCancel}
            >
              {isTransitioning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cancelling...
                </>
              ) : (
                "Confirm Cancel Batch"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
