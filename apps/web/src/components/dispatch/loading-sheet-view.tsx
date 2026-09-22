"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { confirmDispatch } from "@/server/services/dispatch-service";

const LoadingSheetPdfButton = dynamic(
  () => import("@/components/dispatch/loading-sheet-pdf-button"),
  { ssr: false }
);
import { formatWeightKg, formatWidthInch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  ArrowLeft,
  Printer,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Send,
  Loader2,
  FileText,
  User,
  Phone,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";

interface LoadingSheetViewProps {
  batch: any;
}

export function LoadingSheetView({ batch }: LoadingSheetViewProps) {
  const router = useRouter();

  // Loaded Quantities state: map of orderItemId -> loadedKg. Defaults to the
  // actual weight of the reels allocated to that line (what's physically
  // sitting in the warehouse to load), not the order's demanded quantity —
  // those two numbers can legitimately differ once real reels are matched.
  const [loadedQuantities, setLoadedQuantities] = React.useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    batch.orders.forEach((lo: any) => {
      lo.order.items.forEach((it: any) => {
        const reels = it.allocatedStockItems as any[] | undefined;
        const reelTotalKg = reels?.length
          ? reels.reduce((s, r) => s + Number(r.quantityKg), 0)
          : null;
        map[it.id] = reelTotalKg ?? Number(it.quantityKg);
      });
    });
    return map;
  });

  // Dispatch Form State
  const [vehicleNumber, setVehicleNumber] = React.useState(
    batch.truck?.registrationNumber || ""
  );
  const [driverName, setDriverName] = React.useState(batch.driverName || "");
  const [driverPhone, setDriverPhone] = React.useState(batch.driverPhone || "");
  const [gatePassNumber, setGatePassNumber] = React.useState(
    `GP-${batch.batchNumber.replace("LB-", "")}`
  );
  const [dispatchedAt, setDispatchedAt] = React.useState(
    new Date().toISOString().split("T")[0]
  );
  const [remarks, setRemarks] = React.useState("");

  // Export / logistics document fields — the primary buyer defaults from the
  // batch's first client, everything else is typed in by dispatch staff.
  const primaryClient = batch.distinctClients?.[0];
  const [consigneeName, setConsigneeName] = React.useState(
    batch.dispatch?.consigneeName || primaryClient?.name || ""
  );
  const [consigneeAddress, setConsigneeAddress] = React.useState(
    batch.dispatch?.consigneeAddress ||
      (primaryClient
        ? [primaryClient.addressLine1, primaryClient.addressLine2, primaryClient.city, primaryClient.state, primaryClient.pincode]
            .filter(Boolean)
            .join(", ")
        : "")
  );
  const [voucherNumber, setVoucherNumber] = React.useState(batch.dispatch?.voucherNumber || "");
  const [termsOfPayment, setTermsOfPayment] = React.useState(batch.dispatch?.termsOfPayment || "");
  const [termsOfDelivery, setTermsOfDelivery] = React.useState(batch.dispatch?.termsOfDelivery || "");
  const [dispatchThrough, setDispatchThrough] = React.useState(
    batch.dispatch?.dispatchThrough || "Road / Truck"
  );
  const [destination, setDestination] = React.useState(
    batch.dispatch?.destination || (primaryClient ? `${primaryClient.city}, ${primaryClient.state}` : "")
  );
  const [vesselFlightNo, setVesselFlightNo] = React.useState(batch.dispatch?.vesselFlightNo || "");

  // Confirmation Modal
  const [confirmModalOpen, setConfirmModalOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Calculate live total loaded kg
  const totalLoadedKg = Object.values(loadedQuantities).reduce((acc, v) => acc + (v || 0), 0);
  const truckCapacityKg = batch.truck ? Number(batch.truck.capacityKg) : 25000;
  const capacityPct = Math.round((totalLoadedKg / truckCapacityKg) * 100);

  const handleLoadedQtyChange = (orderItemId: string, val: number) => {
    setLoadedQuantities((prev) => ({
      ...prev,
      [orderItemId]: Math.max(0, val),
    }));
  };

  const handleConfirmSubmit = async () => {
    if (!vehicleNumber.trim() || !driverName.trim()) {
      toast.error("Vehicle registration number and Driver name are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await confirmDispatch({
        loadBatchId: batch.id,
        vehicleNumber,
        driverName,
        driverPhone,
        gatePassNumber,
        dispatchedAt: new Date(dispatchedAt).toISOString(),
        remarks,
        loadedQuantities,
        consigneeName,
        consigneeAddress,
        voucherNumber,
        termsOfPayment,
        termsOfDelivery,
        dispatchThrough,
        destination,
        vesselFlightNo,
      });

      toast.success(
        `Dispatch confirmed! Gate Pass #${result.gatePassNumber} created and WhatsApp notifications enqueued.`
      );
      setConfirmModalOpen(false);
      router.push("/dispatch/history");
    } catch (err: any) {
      toast.error(err.message || "Failed to confirm dispatch");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAlreadyDispatched = batch.status === "DISPATCHED" || batch.status === "DELIVERED";

  return (
    <div className="space-y-6 print:space-y-4 max-w-5xl mx-auto font-sans pb-10">
      {/* Top Header & Actions (Hidden in Print View) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 bg-white p-6 sm:p-7 rounded-[26px] border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] print:hidden">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm" className="h-9 px-3 rounded-xl border-slate-200">
            <Link href="/dispatch">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Dispatch
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold font-mono text-slate-900">
                Loading Sheet: {batch.batchNumber}
              </h1>
              <Badge className="font-mono text-xs uppercase">{batch.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Vehicle: <strong>{batch.truck?.registrationNumber || "Unassigned"}</strong> • Transporter: {batch.transporter?.name || "Direct / Self"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="h-10 px-4 rounded-xl text-xs font-bold gap-1.5 shadow-xs border-slate-200"
          >
            <Printer className="h-4 w-4" /> Print Loading Sheet (A4)
          </Button>

          <LoadingSheetPdfButton
            batch={batch}
            loadedQuantities={loadedQuantities}
            vehicleNumber={vehicleNumber}
            driverName={driverName}
            driverPhone={driverPhone}
            gatePassNumber={gatePassNumber}
            dispatchedAt={dispatchedAt}
            remarks={remarks}
            consigneeName={consigneeName}
            consigneeAddress={consigneeAddress}
            voucherNumber={voucherNumber}
            termsOfPayment={termsOfPayment}
            termsOfDelivery={termsOfDelivery}
            dispatchThrough={dispatchThrough}
            destination={destination}
            vesselFlightNo={vesselFlightNo}
          />

          {!isAlreadyDispatched && (
            <Button
              type="button"
              size="sm"
              onClick={() => setConfirmModalOpen(true)}
              className="h-10 px-5 rounded-full bg-[#161622] hover:bg-[#202030] text-white text-xs font-bold gap-1.5 shadow-sm"
            >
              <CheckCircle2 className="h-4 w-4 text-[#d4f842]" /> Confirm Dispatch & Gate Pass
            </Button>
          )}
        </div>
      </div>

      {/* Dispatch / Export Document — standard logistics document columns */}
      <Card className="rounded-[26px] border border-slate-100 shadow-sm bg-white overflow-hidden print:border print:shadow-none">
        <CardHeader className="p-6 pb-4 border-b">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <FileText className="h-4 w-4 text-sky-500" /> Dispatch / Export Document
          </CardTitle>
          <CardDescription className="text-xs">
            Standard logistics document fields — printed on the dispatch advice / packing list.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-100/80 text-[10px] font-bold">
                <TableHead>Date</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Buyer Address</TableHead>
                <TableHead>Consignee</TableHead>
                <TableHead>Consignee Address</TableHead>
                <TableHead>Voucher No.</TableHead>
                <TableHead>Terms of Payment</TableHead>
                <TableHead>Mobile Number</TableHead>
                <TableHead>Terms of Delivery</TableHead>
                <TableHead>Dispatch Doc. No</TableHead>
                <TableHead>Dispatch Through</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Vessel/Flight No.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="text-[11px] font-mono">
                <TableCell>{new Date(dispatchedAt).toLocaleDateString("en-IN")}</TableCell>
                <TableCell className="font-semibold">{primaryClient?.name || "—"}</TableCell>
                <TableCell className="max-w-[160px] truncate" title={consigneeAddress}>
                  {primaryClient
                    ? [primaryClient.addressLine1, primaryClient.city, primaryClient.state]
                        .filter(Boolean)
                        .join(", ")
                    : "—"}
                </TableCell>
                <TableCell>{consigneeName || "—"}</TableCell>
                <TableCell className="max-w-[160px] truncate" title={consigneeAddress}>
                  {consigneeAddress || "—"}
                </TableCell>
                <TableCell>{voucherNumber || "—"}</TableCell>
                <TableCell>{termsOfPayment || "—"}</TableCell>
                <TableCell>{primaryClient?.phone || "—"}</TableCell>
                <TableCell>{termsOfDelivery || "—"}</TableCell>
                <TableCell>{gatePassNumber || "—"}</TableCell>
                <TableCell>{dispatchThrough || "—"}</TableCell>
                <TableCell>{destination || "—"}</TableCell>
                <TableCell>{vesselFlightNo || "—"}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Printable Loading Sheet Document */}
      <Card className="rounded-[26px] border border-slate-100 shadow-sm bg-white overflow-hidden print:border print:shadow-none">
        {/* Printable Header */}
        <CardHeader className="p-6 pb-4 border-b">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black font-mono text-slate-950">
                HRA PAPER MILL PVT LTD
              </h2>
              <p className="text-xs text-muted-foreground font-mono">
                VEHICLE LOADING SHEET & WEIGHBRIDGE PASS
              </p>
              <div className="text-xs font-mono text-slate-700 mt-2 space-y-0.5">
                <div>BATCH NUMBER: <strong>{batch.batchNumber}</strong></div>
                <div>TRANSPORTER: <strong>{batch.transporter?.name || "Direct Mill Logistics"}</strong></div>
              </div>
            </div>

            <div className="text-right text-xs font-mono space-y-1">
              <div>DATE: <strong>{new Date().toLocaleDateString("en-IN")}</strong></div>
              <div>VEHICLE NO: <strong>{vehicleNumber || "Pending Entry"}</strong></div>
              <div>DRIVER: <strong>{driverName || "Pending Entry"}</strong> ({driverPhone || "—"})</div>
              <div>GATE PASS: <strong>{gatePassNumber}</strong></div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Loaded Line Items Table */}
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-100/80 text-[11px] font-bold">
                <TableHead className="w-[40px] text-center">#</TableHead>
                <TableHead>Order No.</TableHead>
                <TableHead>Client & Destination</TableHead>
                <TableHead>Reel No(s).</TableHead>
                <TableHead className="text-right">Reel Size</TableHead>
                <TableHead className="text-right">GSM</TableHead>
                <TableHead className="text-right">Planned Qty</TableHead>
                <TableHead className="text-right w-[140px]">Loaded Qty (kg)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batch.orders.flatMap((lo: any) =>
                lo.order.items.map((it: any, itemIdx: number) => {
                  const reels = (it.allocatedStockItems as any[] | undefined) || [];
                  const reelTotalKg = reels.length
                    ? reels.reduce((s, r) => s + Number(r.quantityKg), 0)
                    : null;
                  const plannedQtyKg = reelTotalKg ?? Number(it.quantityKg);
                  const loadedVal = loadedQuantities[it.id] ?? plannedQtyKg;
                  const reelLabel = reels.length
                    ? reels.map((r) => r.reelNumber || "—").join(", ")
                    : "Not yet allocated";

                  return (
                    <TableRow key={it.id} className="text-xs">
                      <TableCell className="text-center font-mono text-muted-foreground">
                        {itemIdx + 1}
                      </TableCell>
                      <TableCell className="font-mono font-bold text-primary">
                        {lo.order.orderNumber}
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-slate-900">{lo.order.client.name}</div>
                        <div className="text-[11px] font-mono text-muted-foreground">
                          {lo.order.client.city}, {lo.order.client.state}
                        </div>
                      </TableCell>
                      <TableCell className={`font-mono text-[11px] ${reels.length ? "text-slate-700" : "text-amber-600 font-bold"}`}>
                        {reelLabel}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {formatWidthInch(it.widthInch)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {it.gsm} GSM
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-700">
                        {formatWeightKg(plannedQtyKg)}
                      </TableCell>
                      <TableCell className="text-right">
                        {isAlreadyDispatched ? (
                          <span className="font-mono font-bold text-emerald-700">
                            {formatWeightKg(loadedVal)}
                          </span>
                        ) : (
                          <Input
                            type="number"
                            step="any"
                            min={0}
                            className="h-8 text-right font-mono text-xs font-bold bg-white"
                            value={loadedVal}
                            onChange={(e) =>
                              handleLoadedQtyChange(it.id, parseFloat(e.target.value) || 0)
                            }
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Running Totals & Capacity Strip */}
          <div className="p-4 bg-slate-50 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono text-xs">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-[10px] text-muted-foreground font-sans block">
                  TOTAL LOADED WEIGHT
                </span>
                <strong className="text-base text-slate-900">
                  {formatWeightKg(totalLoadedKg)}
                </strong>
              </div>
              <div className="h-6 w-px bg-slate-300 hidden sm:block" />
              <div>
                <span className="text-[10px] text-muted-foreground font-sans block">
                  TRUCK CAPACITY UTILIZATION
                </span>
                <strong
                  className={`text-base ${
                    capacityPct > 100 ? "text-destructive" : "text-emerald-700"
                  }`}
                >
                  {capacityPct}% ({formatWeightKg(truckCapacityKg)})
                </strong>
              </div>
            </div>

            <div className="text-slate-600 font-sans text-xs">
              Total <strong>{batch.orders.length}</strong> orders for <strong>{batch.distinctClients.length}</strong> destination clients.
            </div>
          </div>

          {/* Signature Block (For Print & Physical Manifest) */}
          <div className="p-8 pt-12 border-t grid grid-cols-3 gap-8 text-center text-xs font-mono">
            <div className="space-y-8">
              <div className="border-b border-slate-400 pb-8" />
              <div className="font-bold text-slate-800">LOADING SUPERVISOR</div>
            </div>
            <div className="space-y-8">
              <div className="border-b border-slate-400 pb-8" />
              <div className="font-bold text-slate-800">WEIGHBRIDGE OPERATOR</div>
            </div>
            <div className="space-y-8">
              <div className="border-b border-slate-400 pb-8" />
              <div className="font-bold text-slate-800">DRIVER SIGNATURE</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation & Gate Pass Dialog */}
      <Dialog open={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <div className="flex items-center gap-2 text-emerald-700">
              <ShieldCheck className="h-6 w-6" />
              <DialogTitle className="text-base font-bold">
                Confirm Vehicle Departure & Generate Gate Pass
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              Confirm weighbridge payload and fan out real-time WhatsApp departure notifications to clients.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Form Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Vehicle Registration No. *</label>
                <Input
                  placeholder="e.g. RJ-14-GA-9021"
                  className="font-mono text-xs uppercase bg-white"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Gate Pass Number *</label>
                <Input
                  className="font-mono text-xs bg-white"
                  value={gatePassNumber}
                  onChange={(e) => setGatePassNumber(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Driver Name *</label>
                <Input
                  placeholder="Driver full name"
                  className="text-xs bg-white"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Driver Phone *</label>
                <Input
                  placeholder="+91 98765 43210"
                  className="font-mono text-xs bg-white"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Departure Remarks (Optional)</label>
              <Input
                placeholder="e.g. Tarpaulin tied, weighed on scale #2"
                className="text-xs bg-white"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>

            {/* Export / logistics document fields */}
            <div className="border-t pt-3 space-y-3">
              <label className="font-bold text-slate-800 text-[11px] uppercase tracking-wider block">
                Dispatch / Export Document Fields
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Consignee</label>
                  <Input
                    placeholder="If different from buyer"
                    className="text-xs bg-white"
                    value={consigneeName}
                    onChange={(e) => setConsigneeName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Consignee Address</label>
                  <Input
                    className="text-xs bg-white"
                    value={consigneeAddress}
                    onChange={(e) => setConsigneeAddress(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Voucher No.</label>
                  <Input
                    className="font-mono text-xs bg-white"
                    value={voucherNumber}
                    onChange={(e) => setVoucherNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Terms of Payment</label>
                  <Input
                    placeholder="e.g. Advance / 30 days credit"
                    className="text-xs bg-white"
                    value={termsOfPayment}
                    onChange={(e) => setTermsOfPayment(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Terms of Delivery</label>
                  <Input
                    placeholder="e.g. Ex-works / FOB / CIF"
                    className="text-xs bg-white"
                    value={termsOfDelivery}
                    onChange={(e) => setTermsOfDelivery(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Dispatch Through</label>
                  <Input
                    placeholder="e.g. Road / Rail / Sea / Air"
                    className="text-xs bg-white"
                    value={dispatchThrough}
                    onChange={(e) => setDispatchThrough(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Destination</label>
                  <Input
                    className="text-xs bg-white"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Vessel/Flight No.</label>
                  <Input
                    placeholder="If applicable"
                    className="font-mono text-xs bg-white"
                    value={vesselFlightNo}
                    onChange={(e) => setVesselFlightNo(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Rule E: WhatsApp Fanout Notification Preview */}
            <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-lg space-y-2">
              <div className="flex items-center gap-2 font-bold text-blue-950 text-xs">
                <MessageSquare className="h-4 w-4 text-blue-700" />
                Rule E: WhatsApp Departure Notifications ({batch.distinctClients.length} Clients)
              </div>
              <p className="text-[11px] text-blue-900">
                The system will automatically queue official departure WhatsApp alerts to the following verified client numbers:
              </p>
              <div className="space-y-1 pl-2 font-mono text-[11px] text-blue-950">
                {batch.distinctClients.map((c: any) => (
                  <div key={c.id} className="flex justify-between">
                    <span>• {c.name} ({c.city})</span>
                    <strong className="text-blue-700">{c.whatsappNumber || c.phone}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setConfirmModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSubmitting || !vehicleNumber.trim() || !driverName.trim()}
              onClick={handleConfirmSubmit}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Dispatching...
                </>
              ) : (
                "Authorize & Confirm Dispatch"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
