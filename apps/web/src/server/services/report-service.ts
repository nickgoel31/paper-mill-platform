"use server";

import { db } from "@/lib/db";
import { ReportFilter, ReportResult, ReportType } from "./report-types";

function dateRange(filter?: ReportFilter) {
  const now = new Date();
  const end = filter?.endDate ? new Date(filter.endDate) : now;
  const start = filter?.startDate
    ? new Date(filter.startDate)
    : new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  return { start, end };
}

async function ordersReport(filter?: ReportFilter): Promise<ReportResult> {
  const { start, end } = dateRange(filter);
  const orders = await db.order.findMany({
    where: { orderDate: { gte: start, lte: end } },
    include: { client: true, items: true },
    orderBy: { orderDate: "desc" },
  });

  return {
    columns: [
      { key: "orderNumber", header: "Order #" },
      { key: "orderDate", header: "Order Date" },
      { key: "client", header: "Client" },
      { key: "status", header: "Status" },
      { key: "priority", header: "Priority" },
      { key: "itemsCount", header: "Items" },
      { key: "quantityKg", header: "Quantity (kg)" },
      { key: "dispatchedKg", header: "Dispatched (kg)" },
    ],
    rows: orders.map((o) => ({
      orderNumber: o.orderNumber,
      orderDate: o.orderDate.toISOString().slice(0, 10),
      client: o.client.name,
      status: o.status,
      priority: o.priority,
      itemsCount: o.items.length,
      quantityKg: o.items.reduce((s, i) => s + Number(i.quantityKg), 0),
      dispatchedKg: o.items.reduce((s, i) => s + Number(i.dispatchedKg), 0),
    })),
  };
}

async function productionReport(filter?: ReportFilter): Promise<ReportResult> {
  const { start, end } = dateRange(filter);
  const runs = await db.productionRun.findMany({
    where: { plannedDate: { gte: start, lte: end } },
    include: { machine: true },
    orderBy: { plannedDate: "desc" },
  });

  return {
    columns: [
      { key: "runNumber", header: "Run #" },
      { key: "plannedDate", header: "Planned Date" },
      { key: "machine", header: "Machine" },
      { key: "gsm", header: "GSM" },
      { key: "status", header: "Status" },
      { key: "plannedKg", header: "Planned (kg)" },
      { key: "actualKg", header: "Actual (kg)" },
      { key: "trimPercent", header: "Trim (%)" },
    ],
    rows: runs.map((r) => ({
      runNumber: r.runNumber,
      plannedDate: r.plannedDate.toISOString().slice(0, 10),
      machine: r.machine.name,
      gsm: r.gsm,
      status: r.status,
      plannedKg: Number(r.totalPlannedKg),
      actualKg: Number(r.totalActualKg),
      trimPercent: r.totalTrimPercent ? Number(r.totalTrimPercent) : 0,
    })),
  };
}

async function dispatchReport(filter?: ReportFilter): Promise<ReportResult> {
  const { start, end } = dateRange(filter);
  const dispatches = await db.dispatch.findMany({
    where: { dispatchedAt: { gte: start, lte: end } },
    orderBy: { dispatchedAt: "desc" },
  });

  return {
    columns: [
      { key: "dispatchNumber", header: "Dispatch #" },
      { key: "dispatchedAt", header: "Dispatched At" },
      { key: "vehicleNumber", header: "Vehicle" },
      { key: "driverName", header: "Driver" },
      { key: "destination", header: "Destination" },
      { key: "totalDispatchedKg", header: "Dispatched (kg)" },
    ],
    rows: dispatches.map((d) => ({
      dispatchNumber: d.dispatchNumber,
      dispatchedAt: d.dispatchedAt.toISOString().slice(0, 10),
      vehicleNumber: d.vehicleNumber,
      driverName: d.driverName,
      destination: d.destination || "—",
      totalDispatchedKg: Number(d.totalDispatchedKg),
    })),
  };
}

async function wastageReport(filter?: ReportFilter): Promise<ReportResult> {
  const { start, end } = dateRange(filter);
  const logs = await db.wastageLog.findMany({
    where: { recordedAt: { gte: start, lte: end } },
    include: { productionRun: { include: { machine: true } } },
    orderBy: { recordedAt: "desc" },
  });

  return {
    columns: [
      { key: "recordedAt", header: "Recorded At" },
      { key: "runNumber", header: "Run #" },
      { key: "machine", header: "Machine" },
      { key: "wastageType", header: "Type" },
      { key: "wastageKg", header: "Wastage (kg)" },
      { key: "reason", header: "Reason" },
    ],
    rows: logs.map((w) => ({
      recordedAt: w.recordedAt.toISOString().slice(0, 10),
      runNumber: w.productionRun?.runNumber || "—",
      machine: w.productionRun?.machine?.name || "—",
      wastageType: w.wastageType,
      wastageKg: Number(w.wastageKg),
      reason: w.reason || "",
    })),
  };
}

async function invoicesReport(filter?: ReportFilter): Promise<ReportResult> {
  const { start, end } = dateRange(filter);
  const invoices = await db.invoice.findMany({
    where: { invoiceDate: { gte: start, lte: end } },
    include: { client: true, payments: true },
    orderBy: { invoiceDate: "desc" },
  });

  return {
    columns: [
      { key: "invoiceNumber", header: "Invoice #" },
      { key: "invoiceDate", header: "Invoice Date" },
      { key: "client", header: "Client" },
      { key: "status", header: "Status" },
      { key: "totalAmount", header: "Total (INR)" },
      { key: "paidAmount", header: "Paid (INR)" },
      { key: "balanceAmount", header: "Balance (INR)" },
    ],
    rows: invoices.map((inv) => {
      const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
      return {
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate.toISOString().slice(0, 10),
        client: inv.client.name,
        status: inv.status,
        totalAmount: Number(inv.totalAmount),
        paidAmount: paid,
        balanceAmount: Number(inv.totalAmount) - paid,
      };
    }),
  };
}

async function stockReport(): Promise<ReportResult> {
  const items = await db.stockItem.findMany({
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  return {
    columns: [
      { key: "reelNumber", header: "Reel #" },
      { key: "gsm", header: "GSM" },
      { key: "widthInch", header: "Width (in)" },
      { key: "paperType", header: "Paper Type" },
      { key: "status", header: "Status" },
      { key: "quantityKg", header: "Quantity (kg)" },
      { key: "location", header: "Location" },
    ],
    rows: items.map((s) => ({
      reelNumber: s.reelNumber || "—",
      gsm: s.gsm,
      widthInch: Number(s.widthInch),
      paperType: s.paperType,
      status: s.status,
      quantityKg: Number(s.quantityKg),
      location: s.location || "—",
    })),
  };
}

export async function getReportData(type: ReportType, filter?: ReportFilter): Promise<ReportResult> {
  switch (type) {
    case "orders":
      return ordersReport(filter);
    case "production":
      return productionReport(filter);
    case "dispatch":
      return dispatchReport(filter);
    case "wastage":
      return wastageReport(filter);
    case "invoices":
      return invoicesReport(filter);
    case "stock":
      return stockReport();
    default:
      throw new Error(`Unknown report type: ${type}`);
  }
}
