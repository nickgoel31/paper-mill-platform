import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatWidthInch } from "@/lib/utils";

interface RunCardData {
  runNumber: string;
  machineName: string;
  maxDeckleInch: number;
  gsm: number;
  status: string;
  totalPlannedKg: number;
  totalActualKg?: number;
  totalTrimPercent: number;
  createdAt: string | Date;
  patterns: Array<{
    sequence: number;
    repetitions: number;
    usedWidthInch: number;
    trimWidthInch: number;
    trimPercent: number;
    estimatedKg: number;
    isManuallyEdited?: boolean;
    cuts: Array<{
      orderItemId?: string;
      orderNumber?: string;
      clientName?: string;
      widthInch: number;
      count: number;
      isStockPreset?: boolean;
    }>;
  }>;
  orderItems: Array<{
    id: string;
    widthInch: number;
    gsm: number;
    quantityKg: number;
    producedKg: number;
    tolerancePercent: number;
    order?: {
      orderNumber: string;
      deliveryDate?: string | Date | null;
      priority?: string;
      client?: {
        name: string;
        city?: string;
      };
    };
  }>;
}

export function generateRunCardPDF(data: RunCardData) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  let currentY = margin;

  // ---------------------------------------------------------------------------
  // 1. TOP HEADER & BRANDING
  // ---------------------------------------------------------------------------
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(margin, currentY, pageWidth - margin * 2, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("HRA PAPER MILLS — SLITTER RUN CARD", margin + 6, currentY + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text("Production Slitting & Deckle Knife Instruction Sheet", margin + 6, currentY + 16);

  // Run badge on top right
  doc.setFillColor(30, 41, 59); // slate-800
  doc.roundedRect(pageWidth - margin - 55, currentY + 4, 49, 14, 2, 2, "F");
  
  doc.setTextColor(251, 191, 36); // amber-400
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(data.runNumber, pageWidth - margin - 51, currentY + 10);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.text(`STATUS: ${data.status.toUpperCase()}`, pageWidth - margin - 51, currentY + 15);

  currentY += 26;

  // ---------------------------------------------------------------------------
  // 2. SPECIFICATION METRICS BAR (Custom proportional column widths)
  // ---------------------------------------------------------------------------
  const metricsBoxHeight = 17;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.roundedRect(margin, currentY, pageWidth - margin * 2, metricsBoxHeight, 2, 2, "FD");

  // Column width allocations (Total = 186mm)
  const columns = [
    { label: "MACHINE", val: data.machineName, width: 56 },
    { label: "PAPER GRADE", val: `${data.gsm} GSM`, width: 26 },
    { label: "MAX DECKLE", val: `${data.maxDeckleInch.toFixed(1)}"`, width: 26 },
    { label: "PLANNED OUTPUT", val: `${(data.totalPlannedKg / 1000).toFixed(2)} MT`, width: 40 },
    { label: "TRIM LOSS", val: `${data.totalTrimPercent.toFixed(2)}%`, width: 38 },
  ];

  let currentColX = margin;
  columns.forEach((col, idx) => {
    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(col.label, currentColX + 3.5, currentY + 5.5);

    // Value
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42); // slate-900

    // Wrap machine name if long, otherwise single line
    const textLines = doc.splitTextToSize(col.val, col.width - 6);
    if (textLines.length > 1) {
      doc.setFontSize(7.5);
      doc.text(textLines[0], currentColX + 3.5, currentY + 10.5);
      doc.text(textLines[1], currentColX + 3.5, currentY + 14.5);
    } else {
      doc.text(col.val, currentColX + 3.5, currentY + 12);
    }

    // Divider line between columns
    if (idx < columns.length - 1) {
      doc.setDrawColor(226, 232, 240);
      doc.line(
        currentColX + col.width,
        currentY + 2,
        currentColX + col.width,
        currentY + metricsBoxHeight - 2
      );
    }

    currentColX += col.width;
  });

  currentY += metricsBoxHeight + 6;

  // ---------------------------------------------------------------------------
  // 3. SLITTING PATTERN INSTRUCTIONS (KNIFE SETUPS)
  // ---------------------------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("1. SLITTER KNIFE SETUPS & CUTTING SEQUENCES", margin, currentY);
  currentY += 4;

  data.patterns.forEach((pat) => {
    // Check for page overflow
    if (currentY > pageHeight - 55) {
      doc.addPage();
      currentY = margin + 5;
    }

    const cardHeight = 24;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, currentY, pageWidth - margin * 2, cardHeight, 2, 2, "FD");

    // Pattern header line
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(margin, currentY, pageWidth - margin * 2, 6.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `PATTERN #${pat.sequence} — ${pat.repetitions} CUTS (${(pat.estimatedKg / 1000).toFixed(3)} MT)`,
      margin + 4,
      currentY + 4.5
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    const trimInfo = `Deckle: ${pat.usedWidthInch.toFixed(1)}" / ${data.maxDeckleInch.toFixed(1)}"   Trim: ${pat.trimWidthInch.toFixed(1)}" (${pat.trimPercent.toFixed(2)}%)`;
    doc.text(trimInfo, pageWidth - margin - 4, currentY + 4.5, { align: "right" });

    // Visual knife strip
    const stripY = currentY + 8;
    const stripWidth = pageWidth - margin * 2 - 8;
    const stripHeight = 9;
    let currentX = margin + 4;

    doc.setDrawColor(148, 163, 184);
    doc.setFillColor(226, 232, 240);
    doc.rect(currentX, stripY, stripWidth, stripHeight, "FD");

    pat.cuts.forEach((cut) => {
      const cutWidthMm = (cut.widthInch / data.maxDeckleInch) * stripWidth;
      const isStock = cut.isStockPreset || cut.orderNumber === "STOCK";

      for (let i = 0; i < cut.count; i++) {
        // Fill box for each slit roll
        if (isStock) {
          doc.setFillColor(251, 191, 36); // amber-400 (Stock Preset)
        } else {
          doc.setFillColor(186, 230, 253); // sky-200
        }
        doc.setDrawColor(100, 116, 139);
        doc.rect(currentX, stripY, cutWidthMm, stripHeight, "FD");

        // Text inside roll
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(15, 23, 42);
        const textLabel = isStock ? `${cut.widthInch}" [STOCK]` : `${cut.widthInch}"`;
        doc.text(textLabel, currentX + cutWidthMm / 2, stripY + 4.2, { align: "center" });

        if (cut.orderNumber && !isStock && cutWidthMm > 14) {
          doc.setFontSize(5.5);
          doc.setTextColor(71, 85, 105);
          doc.text(cut.orderNumber, currentX + cutWidthMm / 2, stripY + 7.5, { align: "center" });
        }

        currentX += cutWidthMm;
      }
    });

    // Residual trim box if any
    const trimWidthMm = (pat.trimWidthInch / data.maxDeckleInch) * stripWidth;
    if (trimWidthMm > 1) {
      doc.setFillColor(241, 245, 249);
      doc.rect(currentX, stripY, trimWidthMm, stripHeight, "FD");
      doc.setFontSize(5.5);
      doc.setTextColor(148, 163, 184);
      doc.text("TRIM", currentX + trimWidthMm / 2, stripY + 5.8, { align: "center" });
    }

    // Blade Breakdown Text
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);
    const bladeSummary = pat.cuts
      .map((c) => {
        const isStock = c.isStockPreset || c.orderNumber === "STOCK";
        return isStock
          ? `${c.count}×${c.widthInch}" [★ STOCK PRESET]`
          : `${c.count}×${c.widthInch}" (${c.orderNumber || "Order"})`;
      })
      .join("  +  ");

    const wrappedBladeText = doc.splitTextToSize(`Blades: ${bladeSummary}`, pageWidth - margin * 2 - 8);
    doc.text(wrappedBladeText[0] || "", margin + 4, currentY + 21);

    currentY += cardHeight + 4;
  });

  currentY += 3;

  // ---------------------------------------------------------------------------
  // 4. CUSTOMER ORDERS & ALLOCATED QUANTITIES TABLE
  // ---------------------------------------------------------------------------
  if (currentY > pageHeight - 65) {
    doc.addPage();
    currentY = margin + 5;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("2. ORDER FULFILLMENT & REEL ALLOCATION SUMMARY", margin, currentY);
  currentY += 3;

  // Build table rows
  const tableRows = data.orderItems.map((it, idx) => {
    const clientStr = it.order?.client ? `${it.order.client.name} (${it.order.client.city || "Delhi"})` : "—";
    const dateStr = it.order?.deliveryDate
      ? new Date(it.order.deliveryDate).toLocaleDateString("en-IN")
      : "Open";

    return [
      String(idx + 1),
      it.order?.orderNumber || "DIRECT",
      clientStr,
      `${formatWidthInch(Number(it.widthInch))}`,
      `${Number(it.quantityKg).toLocaleString("en-IN")} kg`,
      `±${Number(it.tolerancePercent).toFixed(1)}%`,
      dateStr,
      it.order?.priority || "NORMAL",
    ];
  });

  // Check if there are any stock preset cuts in the patterns and add them to the summary table
  const stockPresetCuts = new Map<number, number>();
  data.patterns.forEach((p) => {
    p.cuts.forEach((c) => {
      if (c.isStockPreset || c.orderNumber === "STOCK") {
        const prev = stockPresetCuts.get(c.widthInch) || 0;
        stockPresetCuts.set(c.widthInch, prev + c.count * p.repetitions);
      }
    });
  });

  stockPresetCuts.forEach((reels, width) => {
    tableRows.push([
      "★",
      "STOCK PRESET",
      "Warehouse Master Inventory",
      `${formatWidthInch(width)}`,
      "— (Zero-Waste Surplus)",
      "Exact",
      "Immediate Stock",
      "INVENTORY",
    ]);
  });

  autoTable(doc, {
    startY: currentY,
    head: [["#", "Order No.", "Client & Destination", "Width", "Ordered Qty", "Tolerance", "Target Date", "Priority"]],
    body: tableRows,
    margin: { left: margin, right: margin },
    theme: "grid",
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: "bold",
      halign: "left",
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [30, 41, 59],
      cellPadding: 2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 8 },
      1: { fontStyle: "bold", cellWidth: 26 },
      2: { cellWidth: 46 },
      3: { halign: "right", fontStyle: "bold", cellWidth: 18 },
      4: { halign: "right", cellWidth: 24 },
      5: { halign: "right", cellWidth: 18 },
      6: { halign: "center", cellWidth: 22 },
      7: { halign: "center", cellWidth: 20 },
    },
  });

  // ---------------------------------------------------------------------------
  // 5. OPERATOR SIGN-OFF BOX (SHOP FLOOR EXECUTION)
  // ---------------------------------------------------------------------------
  const finalY = (doc as any).lastAutoTable.finalY + 6;

  if (finalY > pageHeight - 35) {
    doc.addPage();
    currentY = margin + 5;
  } else {
    currentY = finalY;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, currentY, pageWidth - margin * 2, 24, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text("3. SHOP FLOOR COMPLETION & QUALITY SIGN-OFF", margin + 4, currentY + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);

  const colSignWidth = (pageWidth - margin * 2) / 4;

  const signCols = [
    { title: "Slitter Operator Name:", line: "____________________" },
    { title: "Shift / Date:", line: "Shift: [ 1 / 2 / 3 ]   Date: ____" },
    { title: "Actual Reels Cut (Count):", line: "Total Reels: _________" },
    { title: "Shift In-Charge / QA Sign:", line: "____________________" },
  ];

  signCols.forEach((col, idx) => {
    const xPos = margin + idx * colSignWidth + 4;
    doc.text(col.title, xPos, currentY + 11);
    doc.text(col.line, xPos, currentY + 19);
  });

  // ---------------------------------------------------------------------------
  // 6. FOOTER
  // ---------------------------------------------------------------------------
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Generated by PaperMill ERP • Deckle Slitter System • Run #${data.runNumber} • Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 5,
      { align: "center" }
    );
  }

  // Trigger browser download
  doc.save(`RunCard-${data.runNumber}.pdf`);
}
