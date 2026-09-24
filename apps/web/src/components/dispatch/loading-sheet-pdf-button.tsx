"use client";

import * as React from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateLoadingSheetPDF } from "@/lib/pdf/generate-loading-sheet-pdf";
import { formatReelCode } from "@/lib/reel-code";

/**
 * Isolated so that jsPDF (~350 KB) is only ever in a client-side chunk and
 * never bundled into the Cloudflare Worker. Loaded via next/dynamic(ssr:false).
 */
export default function LoadingSheetPdfButton({
  batch,
  loadedQuantities,
  vehicleNumber,
  driverName,
  driverPhone,
  gatePassNumber,
  dispatchedAt,
  remarks,
  consigneeName,
  consigneeAddress,
  voucherNumber,
  termsOfPayment,
  termsOfDelivery,
  dispatchThrough,
  destination,
  vesselFlightNo,
}: {
  batch: any;
  loadedQuantities: Record<string, number>;
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
  gatePassNumber: string;
  dispatchedAt: string;
  remarks?: string;
  consigneeName?: string;
  consigneeAddress?: string;
  voucherNumber?: string;
  termsOfPayment?: string;
  termsOfDelivery?: string;
  dispatchThrough?: string;
  destination?: string;
  vesselFlightNo?: string;
}) {
  const [isGenerating, setIsGenerating] = React.useState(false);

  const handleDownloadPdf = () => {
    setIsGenerating(true);
    try {
      const primaryClient = batch.distinctClients?.[0];

      const lineItems = batch.orders.flatMap((lo: any) =>
        lo.order.items.map((it: any) => {
          const reels = (it.allocatedStockItems as any[] | undefined) || [];
          const reelTotalKg = reels.length
            ? reels.reduce((s, r) => s + Number(r.quantityKg), 0)
            : null;
          const plannedQtyKg = reelTotalKg ?? Number(it.quantityKg);
          const reelLabel = reels.length
            ? reels.map((r) => formatReelCode(r.reelNumber, r.reelOccurrence || 1) || "—").join(", ")
            : "Not yet allocated";
          return {
            orderNumber: lo.order.orderNumber,
            clientName: lo.order.client.name,
            clientCity: lo.order.client.city,
            clientState: lo.order.client.state,
            reelLabel,
            widthInch: Number(it.widthInch),
            gsm: it.gsm,
            plannedQtyKg,
            loadedQtyKg: loadedQuantities[it.id] ?? plannedQtyKg,
          };
        })
      );

      const totalLoadedKg = Object.values(loadedQuantities).reduce(
        (acc: number, v) => acc + (Number(v) || 0),
        0
      );
      const truckCapacityKg = batch.truck ? Number(batch.truck.capacityKg) : 25000;

      generateLoadingSheetPDF({
        batchNumber: batch.batchNumber,
        status: batch.status,
        transporterName: batch.transporter?.name || "Direct Mill Logistics",
        vehicleNumber,
        driverName,
        driverPhone,
        gatePassNumber,
        dispatchedAt,
        remarks,
        consigneeName,
        consigneeAddress,
        voucherNumber,
        termsOfPayment,
        termsOfDelivery,
        dispatchThrough,
        destination,
        vesselFlightNo,
        primaryClient: primaryClient
          ? {
              name: primaryClient.name,
              phone: primaryClient.phone,
              addressLine1: primaryClient.addressLine1,
              city: primaryClient.city,
              state: primaryClient.state,
            }
          : undefined,
        totalLoadedKg,
        truckCapacityKg,
        lineItems,
      });
      toast.success(`Loading sheet PDF generated for ${batch.batchNumber}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isGenerating}
      onClick={handleDownloadPdf}
      className="h-10 px-4 rounded-xl text-xs font-bold gap-1.5 shadow-xs border-slate-200"
    >
      {isGenerating ? (
        <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
      ) : (
        <Download className="h-4 w-4 text-sky-600" />
      )}
      Download Loading Sheet (PDF)
    </Button>
  );
}
