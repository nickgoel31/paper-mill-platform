import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { CLIENT_TYPE_LABELS } from "@/lib/schemas/client";

export interface DailyOrderReportLine {
  clientId: string;
  clientName: string;
  clientCode: string;
  clientCity: string;
  clientType: string;
  monthQtyKg: number;
  openingKg: number;
  newOrdersKg: number;
  dispatchedKg: number;
  closingKg: number;
  pendingSizesKg: number;
}

export interface DailyOrderReportPdfData {
  reportDate: string; // "YYYY-MM-DD"
  millName: string;
  lines: DailyOrderReportLine[];
}

const mt = (kg: number) => (kg / 1000).toFixed(3);

/**
 * Daily order-backlog report, grouped by client type (Dealer, Corrugator,
 * Direct, Retail, Export — same shape as the mill's own handwritten daily
 * ledger): per party, this month's cumulative order qty, opening backlog,
 * new orders received, dispatched, closing backlog, and the portion of the
 * closing backlog still missing a confirmed size — all in metric tons.
 */
function buildDailyOrderReportDoc(data: DailyOrderReportPdfData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  let currentY = margin;

  const dateLabel = new Date(data.reportDate).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });

  // ---------------------------------------------------------------------------
  // HEADER
  // ---------------------------------------------------------------------------
  doc.setFillColor(15, 23, 42);
  doc.rect(margin, currentY, pageWidth - margin * 2, 18, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.text(data.millName.toUpperCase(), margin + 6, currentY + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text("Daily Order Backlog Report — All quantities in Metric Tons (MT)", margin + 6, currentY + 14);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(251, 191, 36);
  doc.text(dateLabel, pageWidth - margin - 6, currentY + 11, { align: "right" });

  currentY += 24;

  // ---------------------------------------------------------------------------
  // ONE TABLE PER CLIENT TYPE
  // ---------------------------------------------------------------------------
  const grouped = new Map<string, DailyOrderReportLine[]>();
  for (const l of data.lines) {
    const list = grouped.get(l.clientType) || [];
    list.push(l);
    grouped.set(l.clientType, list);
  }

  // Preferred display order; any other/unknown type appears after.
  const order = ["DEALER", "CORRUGATOR", "DIRECT", "RETAIL", "EXPORT"];
  const types = Array.from(grouped.keys()).sort(
    (a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b))
  );

  const head = [["Party Name", "Qty (Month)", "Opening (incl. pending sizes)", "New Orders", "Less Dispatch", "Closing (incl. pending sizes)", "Pending Sizes"]];

  types.forEach((type) => {
    const rows = grouped.get(type)!;

    if (currentY > pageHeight - 40) {
      doc.addPage();
      currentY = margin;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(CLIENT_TYPE_LABELS[type as keyof typeof CLIENT_TYPE_LABELS] || type, margin, currentY + 4);
    currentY += 6;

    const totals = rows.reduce(
      (acc, r) => ({
        monthQtyKg: acc.monthQtyKg + r.monthQtyKg,
        openingKg: acc.openingKg + r.openingKg,
        newOrdersKg: acc.newOrdersKg + r.newOrdersKg,
        dispatchedKg: acc.dispatchedKg + r.dispatchedKg,
        closingKg: acc.closingKg + r.closingKg,
        pendingSizesKg: acc.pendingSizesKg + r.pendingSizesKg,
      }),
      { monthQtyKg: 0, openingKg: 0, newOrdersKg: 0, dispatchedKg: 0, closingKg: 0, pendingSizesKg: 0 }
    );

    const body = rows.map((r) => [
      r.clientName,
      mt(r.monthQtyKg),
      r.openingKg > 0.005 ? mt(r.openingKg) : "",
      r.newOrdersKg > 0.005 ? mt(r.newOrdersKg) : "",
      r.dispatchedKg > 0.005 ? mt(r.dispatchedKg) : "",
      r.closingKg > 0.005 ? mt(r.closingKg) : "",
      r.pendingSizesKg > 0.005 ? mt(r.pendingSizesKg) : "",
    ]);
    body.push([
      "TOTAL",
      mt(totals.monthQtyKg),
      mt(totals.openingKg),
      mt(totals.newOrdersKg),
      mt(totals.dispatchedKg),
      mt(totals.closingKg),
      mt(totals.pendingSizesKg),
    ]);

    autoTable(doc, {
      startY: currentY,
      head,
      body,
      margin: { left: margin, right: margin },
      theme: "grid",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 7,
        fontStyle: "bold",
        halign: "center",
      },
      bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59], cellPadding: 1.8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 46 },
        1: { halign: "right", cellWidth: 22 },
        2: { halign: "right", cellWidth: 28 },
        3: { halign: "right", cellWidth: 22 },
        4: { halign: "right", cellWidth: 22 },
        5: { halign: "right", cellWidth: 28 },
        6: { halign: "right", cellWidth: 18 },
      },
      didParseCell: (hookData) => {
        if (hookData.section === "body" && hookData.row.index === body.length - 1) {
          hookData.cell.styles.fontStyle = "bold";
          hookData.cell.styles.fillColor = [226, 232, 240];
        }
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  });

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
      `Generated by PaperMill ERP • Daily Order Backlog Report • ${dateLabel} • Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 5,
      { align: "center" }
    );
  }

  return doc;
}

/** Build the daily order report and trigger a browser download. */
export function generateDailyOrderReportPDF(data: DailyOrderReportPdfData) {
  buildDailyOrderReportDoc(data).save(`DailyOrderReport-${data.reportDate}.pdf`);
}

/** Build the daily order report and return it as a Blob (for on-screen viewing). */
export function generateDailyOrderReportPDFBlob(data: DailyOrderReportPdfData): Blob {
  return buildDailyOrderReportDoc(data).output("blob");
}
