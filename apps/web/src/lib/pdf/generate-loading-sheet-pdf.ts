import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatWidthInch } from "@/lib/utils";

export interface LoadingSheetPdfData {
  batchNumber: string;
  status: string;
  transporterName: string;
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
  gatePassNumber: string;
  dispatchedAt: string | Date;
  remarks?: string;
  consigneeName?: string;
  consigneeAddress?: string;
  voucherNumber?: string;
  termsOfPayment?: string;
  termsOfDelivery?: string;
  dispatchThrough?: string;
  destination?: string;
  vesselFlightNo?: string;
  primaryClient?: {
    name: string;
    phone?: string;
    addressLine1?: string;
    city?: string;
    state?: string;
  };
  totalLoadedKg: number;
  truckCapacityKg: number;
  lineItems: Array<{
    orderNumber: string;
    clientName: string;
    clientCity: string;
    clientState: string;
    reelLabel: string;
    widthInch: number;
    gsm: number;
    plannedQtyKg: number;
    loadedQtyKg: number;
  }>;
}

function buildLoadingSheetDoc(data: LoadingSheetPdfData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  let currentY = margin;

  // ---------------------------------------------------------------------------
  // HEADER
  // ---------------------------------------------------------------------------
  doc.setFillColor(15, 23, 42);
  doc.rect(margin, currentY, pageWidth - margin * 2, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("HRA PAPER MILL PVT LTD", margin + 6, currentY + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text("Vehicle Loading Sheet & Weighbridge Gate Pass", margin + 6, currentY + 16);

  doc.setFillColor(30, 41, 59);
  doc.roundedRect(pageWidth - margin - 60, currentY + 4, 54, 14, 2, 2, "F");

  doc.setTextColor(251, 191, 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(data.batchNumber, pageWidth - margin - 56, currentY + 10);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.text(`STATUS: ${data.status.toUpperCase()}`, pageWidth - margin - 56, currentY + 15);

  currentY += 26;

  // ---------------------------------------------------------------------------
  // GATE PASS / VEHICLE DETAILS BAR
  // ---------------------------------------------------------------------------
  const metricsBoxHeight = 22;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, currentY, pageWidth - margin * 2, metricsBoxHeight, 2, 2, "FD");

  const cols1 = [
    { label: "GATE PASS NO.", val: data.gatePassNumber || "—" },
    { label: "VEHICLE NO.", val: data.vehicleNumber || "—" },
    { label: "TRANSPORTER", val: data.transporterName || "Direct Mill Logistics" },
  ];
  const cols2 = [
    { label: "DRIVER NAME", val: data.driverName || "—" },
    { label: "DRIVER PHONE", val: data.driverPhone || "—" },
    { label: "DISPATCH DATE", val: new Date(data.dispatchedAt).toLocaleDateString("en-IN") },
  ];

  const colWidth = (pageWidth - margin * 2) / 3;
  [cols1, cols2].forEach((rowCols, rowIdx) => {
    rowCols.forEach((col, idx) => {
      const x = margin + idx * colWidth + 4;
      const y = currentY + 5.5 + rowIdx * 9.5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(col.label, x, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      const lines = doc.splitTextToSize(String(col.val), colWidth - 8);
      doc.text(lines[0] || "", x, y + 4.5);
    });
  });

  currentY += metricsBoxHeight + 6;

  // ---------------------------------------------------------------------------
  // DISPATCH / EXPORT DOCUMENT FIELDS
  // ---------------------------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("1. DISPATCH / EXPORT DOCUMENT", margin, currentY);
  currentY += 3;

  autoTable(doc, {
    startY: currentY,
    body: [
      ["Buyer", data.primaryClient?.name || "—", "Buyer Phone", data.primaryClient?.phone || "—"],
      ["Consignee", data.consigneeName || "—", "Consignee Address", data.consigneeAddress || "—"],
      ["Voucher No.", data.voucherNumber || "—", "Terms of Payment", data.termsOfPayment || "—"],
      ["Terms of Delivery", data.termsOfDelivery || "—", "Dispatch Through", data.dispatchThrough || "—"],
      ["Destination", data.destination || "—", "Vessel/Flight No.", data.vesselFlightNo || "—"],
    ],
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: { fontSize: 7.5, cellPadding: 2.2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [248, 250, 252], cellWidth: 34 },
      1: { cellWidth: 59 },
      2: { fontStyle: "bold", fillColor: [248, 250, 252], cellWidth: 34 },
      3: { cellWidth: 59 },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // ---------------------------------------------------------------------------
  // LINE ITEMS TABLE
  // ---------------------------------------------------------------------------
  if (currentY > pageHeight - 70) {
    doc.addPage();
    currentY = margin + 5;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("2. LOADED REELS & QUANTITIES", margin, currentY);
  currentY += 3;

  const rows = data.lineItems.map((it, idx) => [
    String(idx + 1),
    it.orderNumber,
    `${it.clientName}\n${it.clientCity}, ${it.clientState}`,
    it.reelLabel,
    formatWidthInch(it.widthInch),
    `${it.gsm}`,
    `${it.plannedQtyKg.toLocaleString("en-IN")} kg`,
    `${it.loadedQtyKg.toLocaleString("en-IN")} kg`,
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [["#", "Order No.", "Client & Destination", "Reel No(s).", "Width", "GSM", "Planned", "Loaded"]],
    body: rows,
    margin: { left: margin, right: margin },
    theme: "grid",
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: "bold",
    },
    bodyStyles: { fontSize: 7, textColor: [30, 41, 59], cellPadding: 2 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: "center", cellWidth: 7 },
      1: { fontStyle: "bold", cellWidth: 22 },
      2: { cellWidth: 42 },
      3: { cellWidth: 28 },
      4: { halign: "right", cellWidth: 16 },
      5: { halign: "right", cellWidth: 12 },
      6: { halign: "right", cellWidth: 22 },
      7: { halign: "right", fontStyle: "bold", cellWidth: 22 },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // ---------------------------------------------------------------------------
  // TOTALS
  // ---------------------------------------------------------------------------
  if (currentY > pageHeight - 45) {
    doc.addPage();
    currentY = margin + 5;
  }

  const capacityPct = Math.round((data.totalLoadedKg / data.truckCapacityKg) * 100);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, currentY, pageWidth - margin * 2, 16, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("TOTAL LOADED WEIGHT", margin + 4, currentY + 6);
  doc.text("TRUCK CAPACITY UTILIZATION", margin + 70, currentY + 6);

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`${data.totalLoadedKg.toLocaleString("en-IN")} kg`, margin + 4, currentY + 12);
  doc.setTextColor(capacityPct > 100 ? 220 : 5, capacityPct > 100 ? 38 : 150, capacityPct > 100 ? 38 : 5);
  doc.text(`${capacityPct}% (${data.truckCapacityKg.toLocaleString("en-IN")} kg)`, margin + 70, currentY + 12);

  if (data.remarks) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    const remarkLines = doc.splitTextToSize(`Remarks: ${data.remarks}`, 70);
    doc.text(remarkLines, pageWidth - margin - 74, currentY + 6);
  }

  currentY += 22;

  // ---------------------------------------------------------------------------
  // SIGNATURE BLOCK
  // ---------------------------------------------------------------------------
  if (currentY > pageHeight - 40) {
    doc.addPage();
    currentY = margin + 5;
  }

  const signCols = ["LOADING SUPERVISOR", "WEIGHBRIDGE OPERATOR", "DRIVER SIGNATURE"];
  const signColWidth = (pageWidth - margin * 2) / 3;
  signCols.forEach((label, idx) => {
    const x = margin + idx * signColWidth + 4;
    doc.setDrawColor(148, 163, 184);
    doc.line(x, currentY + 18, x + signColWidth - 8, currentY + 18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);
    doc.text(label, x, currentY + 23);
  });

  currentY += 30;

  // ---------------------------------------------------------------------------
  // FOOTER
  // ---------------------------------------------------------------------------
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Generated by PaperMill ERP • Dispatch System • Batch ${data.batchNumber} • Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 5,
      { align: "center" }
    );
  }

  return doc;
}

/** Build the loading sheet / gate pass PDF and trigger a browser download. */
export function generateLoadingSheetPDF(data: LoadingSheetPdfData) {
  buildLoadingSheetDoc(data).save(`LoadingSheet-${data.batchNumber}.pdf`);
}

/** Build the loading sheet PDF and return it as a Blob (for on-screen viewing). */
export function generateLoadingSheetPDFBlob(data: LoadingSheetPdfData): Blob {
  return buildLoadingSheetDoc(data).output("blob");
}
