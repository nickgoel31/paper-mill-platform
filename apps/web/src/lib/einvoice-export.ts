/**
 * Builds a GST e-invoice (IRN) request payload in the NIC/GSP "InvoiceSchema"
 * shape. There is no public multi-tenant e-invoice API — a real IRN is issued
 * by a GSP (e.g. NIC's own portal, ClearTax, Cygnet) after this JSON is
 * uploaded there. This file only builds the request; the IRN/QR code that
 * comes back is recorded manually via markEinvoiceGenerated().
 */
export function buildEinvoiceJson(invoice: {
  invoiceNumber: string;
  invoiceDate: string | Date;
  client: { name: string; gstin: string | null; addressLine1: string; city: string; state: string; pincode: string };
  seller: { name: string; gstin: string; address: string; state: string };
  lines: { description: string; hsnCode: string; quantityKg: number; ratePerKg: number; amount: number }[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
}): string {
  const date = new Date(invoice.invoiceDate);
  const docDate = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;

  const payload = {
    Version: "1.1",
    TranDtls: { TaxSch: "GST", SupTyp: "B2B" },
    DocDtls: { Typ: "INV", No: invoice.invoiceNumber, Dt: docDate },
    SellerDtls: {
      Gstin: invoice.seller.gstin,
      LglNm: invoice.seller.name,
      Addr1: invoice.seller.address,
      Stcd: invoice.seller.state,
    },
    BuyerDtls: {
      Gstin: invoice.client.gstin || "URP",
      LglNm: invoice.client.name,
      Addr1: invoice.client.addressLine1,
      Loc: invoice.client.city,
      Pin: invoice.client.pincode,
      Stcd: invoice.client.state,
    },
    ItemList: invoice.lines.map((l, idx) => ({
      SlNo: String(idx + 1),
      PrdDesc: l.description,
      HsnCd: l.hsnCode,
      Qty: l.quantityKg,
      Unit: "KGS",
      UnitPrice: l.ratePerKg,
      TotAmt: l.amount,
      AssAmt: l.amount,
      GstRt: invoice.igst > 0 ? Number(((invoice.igst / invoice.subtotal) * 100).toFixed(2)) : Number((((invoice.cgst + invoice.sgst) / invoice.subtotal) * 100).toFixed(2)),
      CgstAmt: invoice.cgst > 0 ? Number(((l.amount / invoice.subtotal) * invoice.cgst).toFixed(2)) : 0,
      SgstAmt: invoice.sgst > 0 ? Number(((l.amount / invoice.subtotal) * invoice.sgst).toFixed(2)) : 0,
      IgstAmt: invoice.igst > 0 ? Number(((l.amount / invoice.subtotal) * invoice.igst).toFixed(2)) : 0,
      TotItemVal: Number(
        (l.amount + (l.amount / invoice.subtotal) * (invoice.cgst + invoice.sgst + invoice.igst)).toFixed(2)
      ),
    })),
    ValDtls: {
      AssVal: invoice.subtotal,
      CgstVal: invoice.cgst,
      SgstVal: invoice.sgst,
      IgstVal: invoice.igst,
      TotInvVal: invoice.totalAmount,
    },
  };

  return JSON.stringify(payload, null, 2);
}

export function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
