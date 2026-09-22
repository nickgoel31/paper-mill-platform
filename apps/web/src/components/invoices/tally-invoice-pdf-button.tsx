"use client";

import * as React from "react";
import { toast } from "sonner";
import { Printer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateTallyInvoicePDF } from "@/lib/pdf/generate-tally-invoice-pdf";

interface SellerInfo {
  name: string;
  address: string;
  gstin: string;
  state: string;
  phone: string;
  email: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfsc: string;
}

/**
 * Isolated so that jsPDF (~350 KB) is only ever in a client-side chunk and
 * never bundled into the Cloudflare Worker. Loaded via next/dynamic(ssr:false).
 */
export default function TallyInvoicePdfButton({
  invoice,
  seller,
}: {
  invoice: any;
  seller: SellerInfo;
}) {
  const [isGenerating, setIsGenerating] = React.useState(false);

  const handleDownloadPdf = () => {
    setIsGenerating(true);
    try {
      generateTallyInvoicePDF({
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        irn: invoice.einvoiceStatus === "GENERATED" ? invoice.irn : null,
        seller,
        buyer: {
          name: invoice.client.name,
          addressLine1: invoice.client.addressLine1,
          city: invoice.client.city,
          state: invoice.client.state,
          pincode: invoice.client.pincode,
          gstin: invoice.client.gstin,
        },
        dispatch: invoice.dispatch
          ? {
              dispatchNumber: invoice.dispatch.dispatchNumber,
              vehicleNumber: invoice.dispatch.vehicleNumber,
              transporterName: invoice.dispatch.loadBatch?.transporter?.name,
            }
          : null,
        lines: invoice.lines.map((l: any) => ({
          description: l.description,
          hsnCode: l.hsnCode,
          quantityKg: Number(l.quantityKg),
          ratePerKg: Number(l.ratePerKg),
          amount: Number(l.amount),
        })),
        subtotal: Number(invoice.subtotal),
        cgst: Number(invoice.cgst || 0),
        sgst: Number(invoice.sgst || 0),
        igst: Number(invoice.igst || 0),
        totalAmount: Number(invoice.totalAmount),
      });
      toast.success(`Tally-format tax invoice PDF generated for ${invoice.invoiceNumber}.`);
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
      {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
      Print / Save PDF (A4)
    </Button>
  );
}
