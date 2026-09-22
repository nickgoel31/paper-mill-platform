import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { numberToIndianWords } from "@/lib/number-to-words";

export interface TallyInvoicePdfLine {
  description: string;
  hsnCode?: string | null;
  quantityKg: number;
  ratePerKg: number;
  amount: number;
}

export interface TallyInvoicePdfData {
  invoiceNumber: string;
  invoiceDate: string | Date;
  dueDate?: string | Date | null;
  irn?: string | null;
  seller: {
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
  };
  buyer: {
    name: string;
    addressLine1?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
    gstin?: string | null;
  };
  dispatch?: {
    dispatchNumber?: string | null;
    vehicleNumber?: string | null;
    transporterName?: string | null;
  } | null;
  lines: TallyInvoicePdfLine[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
}

/**
 * Classic Tally ERP "Tax Invoice" print layout: full-grid bordered table,
 * two-column "Invoice Details" header block, boxed party details, goods
 * table with HSN/Qty/Rate/Amount, tax summary and amount-in-words box — the
 * black-and-white ruled layout Tally's own invoice printout uses, rather
 * than this app's branded colour invoice.
 */
function buildTallyInvoiceDoc(data: TallyInvoicePdfData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const innerWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);

  const buyerAddress = [data.buyer.addressLine1, data.buyer.city, data.buyer.state]
    .filter(Boolean)
    .join(", ") + (data.buyer.pincode ? ` - ${data.buyer.pincode}` : "");

  // ---------------------------------------------------------------------------
  // OUTER TITLE
  // ---------------------------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Tax Invoice", pageWidth / 2, y + 5, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("(Original for Recipient)", pageWidth / 2, y + 9, { align: "center" });
  y += 12;

  const boxTop = y;

  // ---------------------------------------------------------------------------
  // SELLER BLOCK (left ~58%) + INVOICE DETAILS GRID (right ~42%)
  // ---------------------------------------------------------------------------
  const sellerColWidth = innerWidth * 0.58;
  const detailsColWidth = innerWidth - sellerColWidth;
  const sellerBoxHeight = 34;

  doc.rect(margin, y, sellerColWidth, sellerBoxHeight);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  let sy = y + 5;
  doc.text(data.seller.name, margin + 2, sy);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  sy += 4.5;
  const addrLines = doc.splitTextToSize(data.seller.address, sellerColWidth - 4);
  addrLines.slice(0, 3).forEach((l: string) => {
    doc.text(l, margin + 2, sy);
    sy += 3.6;
  });
  sy = y + sellerBoxHeight - 10;
  doc.text(`GSTIN/UIN: ${data.seller.gstin}`, margin + 2, sy);
  sy += 3.6;
  doc.text(`State Name: ${data.seller.state}`, margin + 2, sy);
  sy += 3.6;
  doc.text(`E-Mail: ${data.seller.email}`, margin + 2, sy);

  // Invoice details grid — 2 columns x 4 rows, each cell labeled like Tally's export
  const detailsX = margin + sellerColWidth;
  const detailCellW = detailsColWidth / 2;
  const detailRowH = sellerBoxHeight / 4;
  const detailCells: [string, string][] = [
    ["Invoice No.", data.invoiceNumber],
    ["Dated", new Date(data.invoiceDate).toLocaleDateString("en-IN")],
    ["Delivery Note", data.dispatch?.dispatchNumber || "—"],
    ["Mode/Terms of Payment", "30 Days Credit"],
    ["Vehicle Number", data.dispatch?.vehicleNumber || "—"],
    ["Destination", data.buyer.city || "—"],
    ["IRN", data.irn ? data.irn.slice(0, 20) + "…" : "Not Generated"],
    ["Due Date", data.dueDate ? new Date(data.dueDate).toLocaleDateString("en-IN") : "—"],
  ];
  detailCells.forEach(([label, val], idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const cx = detailsX + col * detailCellW;
    const cy = y + row * detailRowH;
    doc.rect(cx, cy, detailCellW, detailRowH);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(80, 80, 80);
    doc.text(label, cx + 1.2, cy + 3);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    const valLines = doc.splitTextToSize(String(val), detailCellW - 2.5);
    doc.text(valLines[0] || "", cx + 1.2, cy + detailRowH - 1.8);
  });

  y += sellerBoxHeight;

  // ---------------------------------------------------------------------------
  // BUYER BLOCK
  // ---------------------------------------------------------------------------
  const buyerBoxHeight = 22;
  doc.rect(margin, y, innerWidth, buyerBoxHeight);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.text("Buyer (Bill to)", margin + 2, y + 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(data.buyer.name, margin + 2, y + 8.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const buyerAddrLines = doc.splitTextToSize(buyerAddress, innerWidth - 4);
  let by = y + 12.5;
  buyerAddrLines.slice(0, 2).forEach((l: string) => {
    doc.text(l, margin + 2, by);
    by += 3.6;
  });
  doc.text(`GSTIN/UIN: ${data.buyer.gstin || "Unregistered"}`, margin + 2, y + buyerBoxHeight - 2);
  doc.text(`State Name: ${data.buyer.state || "—"}`, margin + innerWidth / 2, y + buyerBoxHeight - 2);

  y += buyerBoxHeight;

  // ---------------------------------------------------------------------------
  // GOODS TABLE
  // ---------------------------------------------------------------------------
  const totalWeightKg = data.lines.reduce((s, l) => s + l.quantityKg, 0);

  const rows = data.lines.map((l, idx) => [
    String(idx + 1),
    l.description,
    l.hsnCode || "4804",
    `${l.quantityKg.toLocaleString("en-IN")} kg`,
    l.ratePerKg.toFixed(2),
    "KG",
    l.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 }),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["SI No.", "Description of Goods", "HSN/SAC", "Quantity", "Rate", "per", "Amount"]],
    body: rows,
    margin: { left: margin, right: margin },
    theme: "grid",
    tableLineColor: [0, 0, 0],
    tableLineWidth: 0.2,
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      textColor: [0, 0, 0],
      cellPadding: 1.6,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "center",
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 12 },
      1: { cellWidth: "auto" },
      2: { halign: "center", cellWidth: 20 },
      3: { halign: "right", cellWidth: 24 },
      4: { halign: "right", cellWidth: 18 },
      5: { halign: "center", cellWidth: 10 },
      6: { halign: "right", cellWidth: 26 },
    },
  });

  y = (doc as any).lastAutoTable.finalY;

  // Tax summary rows appended as a second mini grid table (subtotal/CGST/SGST/IGST/total)
  const taxRows: string[][] = [];
  taxRows.push(["", "", "", "", "", "Subtotal", data.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })]);
  if (data.cgst > 0) {
    taxRows.push(["", "", "", "", "", `CGST @ ${data.subtotal > 0 ? ((data.cgst / data.subtotal) * 100).toFixed(1) : 0}%`, data.cgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })]);
  }
  if (data.sgst > 0) {
    taxRows.push(["", "", "", "", "", `SGST @ ${data.subtotal > 0 ? ((data.sgst / data.subtotal) * 100).toFixed(1) : 0}%`, data.sgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })]);
  }
  if (data.igst > 0) {
    taxRows.push(["", "", "", "", "", `IGST @ ${data.subtotal > 0 ? ((data.igst / data.subtotal) * 100).toFixed(1) : 0}%`, data.igst.toLocaleString("en-IN", { minimumFractionDigits: 2 })]);
  }

  autoTable(doc, {
    startY: y,
    body: taxRows,
    margin: { left: margin, right: margin },
    theme: "grid",
    tableLineColor: [0, 0, 0],
    tableLineWidth: 0.2,
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      textColor: [0, 0, 0],
      cellPadding: 1.4,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 20 },
      3: { cellWidth: 24 },
      4: { cellWidth: 18 },
      5: { halign: "right", cellWidth: 10, fontStyle: "bold" },
      6: { halign: "right", cellWidth: 26, fontStyle: "bold" },
    },
    showHead: false,
  });

  y = (doc as any).lastAutoTable.finalY;

  // Grand total row (own box, bold, double-underline style)
  doc.rect(margin, y, innerWidth, 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("Total", margin + 2, y + 4.7);
  doc.text(
    `₹ ${data.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    pageWidth - margin - 2,
    y + 4.7,
    { align: "right" }
  );
  y += 7;

  // ---------------------------------------------------------------------------
  // AMOUNT IN WORDS
  // ---------------------------------------------------------------------------
  const wordsBoxHeight = 10;
  doc.rect(margin, y, innerWidth, wordsBoxHeight);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.text("Amount Chargeable (in words)", margin + 2, y + 3.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text(numberToIndianWords(data.totalAmount), margin + 2, y + 7.8);
  y += wordsBoxHeight;

  // ---------------------------------------------------------------------------
  // BANK DETAILS + DECLARATION (side by side)
  // ---------------------------------------------------------------------------
  const bankBoxHeight = 26;
  const bankColWidth = innerWidth * 0.5;
  doc.rect(margin, y, bankColWidth, bankBoxHeight);
  doc.rect(margin + bankColWidth, y, innerWidth - bankColWidth, bankBoxHeight);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("Company's Bank Details", margin + 2, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  let bky = y + 8;
  [
    ["A/c Holder's Name", data.seller.bankAccountName],
    ["Bank Name", data.seller.bankName],
    ["A/c No.", data.seller.bankAccountNumber],
    ["IFS Code", data.seller.bankIfsc],
  ].forEach(([label, val]) => {
    doc.text(`${label}: `, margin + 2, bky);
    doc.setFont("helvetica", "bold");
    doc.text(String(val), margin + 32, bky);
    doc.setFont("helvetica", "normal");
    bky += 4;
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("Declaration", margin + bankColWidth + 2, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  const declLines = doc.splitTextToSize(
    "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct. Goods once sold will not be taken back.",
    innerWidth - bankColWidth - 4
  );
  let dy = y + 8;
  declLines.forEach((l: string) => {
    doc.text(l, margin + bankColWidth + 2, dy);
    dy += 3.4;
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text(`for ${data.seller.name}`, margin + bankColWidth + 2, y + bankBoxHeight - 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Authorised Signatory", margin + bankColWidth + 2, y + bankBoxHeight - 2);

  y += bankBoxHeight;

  // ---------------------------------------------------------------------------
  // FOOTER
  // ---------------------------------------------------------------------------
  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 100, 100);
  doc.text("This is a Computer Generated Invoice", pageWidth / 2, pageHeight - 6, { align: "center" });

  return doc;
}

/** Build the Tally-format tax invoice and trigger a browser download. */
export function generateTallyInvoicePDF(data: TallyInvoicePdfData) {
  buildTallyInvoiceDoc(data).save(`${data.invoiceNumber}-tax-invoice.pdf`);
}

/** Build the Tally-format tax invoice and return it as a Blob (for on-screen viewing). */
export function generateTallyInvoicePDFBlob(data: TallyInvoicePdfData): Blob {
  return buildTallyInvoiceDoc(data).output("blob");
}
