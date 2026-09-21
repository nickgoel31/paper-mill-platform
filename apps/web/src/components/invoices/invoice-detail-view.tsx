"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelInvoice } from "@/server/services/invoice-service";
import { numberToIndianWords } from "@/lib/number-to-words";
import { formatCurrencyINR, formatWeightKg } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  Ban,
  Loader2,
  FileText,
  Building2,
  Receipt,
  Download,
} from "lucide-react";
import { Role } from "@/generated/prisma/browser";

interface InvoiceDetailViewProps {
  invoice: any;
  userRole: Role;
}

export function InvoiceDetailView({ invoice, userRole }: InvoiceDetailViewProps) {
  const router = useRouter();
  const [cancelModalOpen, setCancelModalOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const isAdmin = userRole === Role.ADMIN;
  const isCancelled = invoice.status === "CANCELLED";

  const handleCancelSubmit = async () => {
    if (!cancelReason.trim()) return;

    setIsSubmitting(true);
    try {
      await cancelInvoice(invoice.id, cancelReason);
      toast.success("Invoice cancelled successfully.");
      setCancelModalOpen(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  const subtotal = Number(invoice.subtotal);
  const cgst = Number(invoice.cgst || 0);
  const sgst = Number(invoice.sgst || 0);
  const igst = Number(invoice.igst || 0);
  const totalAmount = Number(invoice.totalAmount);
  const totalWeightKg = invoice.lines.reduce(
    (acc: number, l: any) => acc + Number(l.quantityKg),
    0
  );

  return (
    <div className="space-y-6 print:space-y-4 max-w-4xl mx-auto font-sans pb-10">
      {/* Action Header (Hidden in Print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 bg-white p-6 sm:p-7 rounded-[26px] border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] print:hidden">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm" className="h-9 px-3 rounded-xl border-slate-200">
            <Link href="/invoices">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Invoices
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold font-mono text-slate-900">
                Tax Invoice: {invoice.invoiceNumber}
              </h1>
              <Badge
                className={
                  isCancelled
                    ? "bg-rose-100 text-rose-800 border-rose-300 font-mono text-xs"
                    : "bg-emerald-100 text-emerald-800 border-emerald-300 font-mono text-xs"
                }
              >
                {invoice.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Client: <strong>{invoice.client.name}</strong> • Total: <strong>{formatCurrencyINR(totalAmount)}</strong>
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
            <Printer className="h-4 w-4" /> Print / Save PDF (A4)
          </Button>

          {!isCancelled && isAdmin && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCancelModalOpen(true)}
              className="h-10 px-4 rounded-xl text-xs font-bold gap-1.5 shadow-xs border-rose-200 text-rose-600 hover:bg-rose-50"
            >
              <Ban className="h-4 w-4" /> Cancel Invoice
            </Button>
          )}
        </div>
      </div>

      {/* Printable Invoice Document (A4 Container) */}
      <Card className="rounded-[26px] border border-slate-100 shadow-sm bg-white overflow-hidden print:border print:shadow-none">
        {/* Header Block */}
        <CardHeader className="p-6 border-b space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b pb-4">
            <div>
              <h2 className="text-2xl font-black font-mono tracking-tight text-slate-950">
                HRA PAPER MILL PVT LTD
              </h2>
              <p className="text-xs text-slate-600 font-mono mt-0.5">
                Plot No. 45-48, Industrial Growth Area, Jaipur, Rajasthan - 302013
              </p>
              <div className="text-xs font-mono text-slate-700 mt-2 space-y-0.5">
                <div>GSTIN: <strong>08AAAAH1234F1Z5</strong> • State: <strong>08 - Rajasthan</strong></div>
                <div>Email: accounts@papermill.local • Phone: +91 141 2789100</div>
              </div>
            </div>

            <div className="text-right font-mono space-y-1">
              <div className="inline-block px-3 py-1 bg-slate-900 text-white font-bold text-sm tracking-wider uppercase rounded">
                TAX INVOICE
              </div>
              <div className="text-xs text-slate-900 pt-1 font-bold">
                INVOICE NO: {invoice.invoiceNumber}
              </div>
              <div className="text-xs text-muted-foreground">
                DATE: {new Date(invoice.invoiceDate).toLocaleDateString("en-IN")}
              </div>
            </div>
          </div>

          {/* Bill To & Dispatch References */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono pt-1">
            <div className="p-3 bg-slate-50 border rounded-lg space-y-1">
              <span className="text-[10px] text-muted-foreground font-sans uppercase font-bold block">
                BILLED TO (BUYER):
              </span>
              <strong className="text-sm text-slate-900 font-sans block">
                {invoice.client.name}
              </strong>
              <div className="text-slate-700 font-sans">
                {invoice.client.addressLine1 || "Industrial Estate"}
                {invoice.client.city && `, ${invoice.client.city}`}
                {invoice.client.state && `, ${invoice.client.state}`}
                {invoice.client.pincode && ` - ${invoice.client.pincode}`}
              </div>
              <div className="pt-1 text-slate-800">
                GSTIN: <strong>{invoice.client.gstin || "Unregistered"}</strong>
              </div>
              <div>State: <strong>{invoice.client.state || "Rajasthan"}</strong></div>
            </div>

            <div className="p-3 bg-slate-50 border rounded-lg space-y-1">
              <span className="text-[10px] text-muted-foreground font-sans uppercase font-bold block">
                DISPATCH & TRANSPORT DETAILS:
              </span>
              <div>DISPATCH REF: <strong>{invoice.dispatch?.dispatchNumber || "Direct Mill Delivery"}</strong></div>
              <div>VEHICLE NO: <strong>{invoice.dispatch?.vehicleNumber || "—"}</strong></div>
              <div>TRANSPORTER: <strong>{invoice.dispatch?.loadBatch?.transporter?.name || "Direct / Self"}</strong></div>
              <div>TERMS: <strong>30 Days from Invoice Date</strong></div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Line Items Table */}
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-100/90 text-[11px] font-bold">
                <TableHead className="w-[40px] text-center">#</TableHead>
                <TableHead>Description of Goods</TableHead>
                <TableHead className="text-center">HSN/SAC</TableHead>
                <TableHead className="text-right">Quantity (kg)</TableHead>
                <TableHead className="text-right">Rate / kg (₹)</TableHead>
                <TableHead className="text-right">Taxable Value (₹)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.map((line: any, idx: number) => (
                <TableRow key={line.id} className="text-xs font-mono">
                  <TableCell className="text-center text-muted-foreground">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="font-semibold text-slate-900 font-sans">
                    {line.description}
                  </TableCell>
                  <TableCell className="text-center font-bold">4804</TableCell>
                  <TableCell className="text-right font-bold">
                    {formatWeightKg(line.quantityKg)}
                  </TableCell>
                  <TableCell className="text-right">
                    ₹{Number(line.ratePerKg).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-bold text-slate-900">
                    {Number(line.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Tax Calculation & Totals Summary */}
          <div className="p-6 border-t grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-mono">
            {/* Amount in Words */}
            <div className="space-y-3">
              <div>
                <span className="text-[10px] text-muted-foreground font-sans uppercase font-bold block">
                  TOTAL AMOUNT IN WORDS:
                </span>
                <div className="p-3 bg-slate-50 border rounded-lg font-bold text-slate-900 font-sans italic text-xs mt-1">
                  {numberToIndianWords(totalAmount)}
                </div>
              </div>

              {/* Bank Details */}
              <div className="p-3 bg-slate-50 border rounded-lg space-y-1 text-[11px]">
                <span className="font-sans font-bold text-slate-800 uppercase block text-[10px]">
                  BANK PAYMENT DETAILS:
                </span>
                <div>Bank: <strong>HDFC Bank Ltd</strong></div>
                <div>A/C Name: <strong>HRA Paper Mill Private Limited</strong></div>
                <div>A/C Number: <strong>50200088991122</strong></div>
                <div>IFSC Code: <strong>HDFC0001234</strong> (Jaipur Branch)</div>
              </div>
            </div>

            {/* Calculations Breakdown */}
            <div className="space-y-2 bg-slate-50 p-4 rounded-lg border">
              <div className="flex justify-between text-slate-700">
                <span>Total Dispatched Weight:</span>
                <strong>{formatWeightKg(totalWeightKg)}</strong>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Taxable Amount (Subtotal):</span>
                <strong>₹{subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
              </div>

              {cgst > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Central GST (CGST @ 9%):</span>
                  <span>₹{cgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              )}

              {sgst > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>State GST (SGST @ 9%):</span>
                  <span>₹{sgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              )}

              {igst > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Integrated GST (IGST @ 18%):</span>
                  <span>₹{igst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              )}

              <div className="border-t border-slate-300 pt-2 flex justify-between text-base font-black text-slate-950">
                <span>TOTAL INVOICE VALUE:</span>
                <span>{formatCurrencyINR(totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Declarations & Signatures */}
          <div className="p-6 pt-4 border-t grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            <div className="text-[11px] text-muted-foreground space-y-1">
              <strong>Declaration:</strong>
              <p>
                We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct. Goods once sold will not be taken back.
              </p>
            </div>

            <div className="text-right space-y-10 font-mono">
              <div className="text-xs font-bold text-slate-900">
                For HRA PAPER MILL PVT LTD
              </div>
              <div className="text-[11px] text-slate-600 font-bold border-t border-slate-400 pt-2 inline-block">
                AUTHORIZED SIGNATORY
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cancel Invoice Modal */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <Ban className="h-5 w-5" />
              <DialogTitle className="text-base font-bold">
                Cancel GST Tax Invoice ({invoice.invoiceNumber})
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              Soft cancel this tax invoice. Invoice numbers are never deleted or reused.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <label className="font-semibold text-slate-700">
              Mandatory Reason for Cancellation *
            </label>
            <Input
              placeholder="e.g. Weight amendment required by buyer, incorrect rate applied"
              className="text-xs bg-white"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              required
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setCancelModalOpen(false)}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isSubmitting || !cancelReason.trim()}
              onClick={handleCancelSubmit}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cancelling...
                </>
              ) : (
                "Confirm Invoice Cancellation"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
