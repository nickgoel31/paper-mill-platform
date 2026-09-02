"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role, InvoiceStatus, Prisma } from "@prisma/client";
import { logAudit } from "./audit-service";
import {
  QueryParams,
  parsePaginationParams,
  buildPaginatedResponse,
} from "./base-service";
import { revalidatePath } from "next/cache";

// -----------------------------------------------------------------------------
// FINANCIAL YEAR INVOICE NUMBER GENERATOR (INV-2526-0001)
// -----------------------------------------------------------------------------

function getIndianFinancialYear(date: Date = new Date()): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12

  let startYear = year;
  let endYear = year + 1;

  if (month < 4) {
    // Jan, Feb, Mar belong to previous FY
    startYear = year - 1;
    endYear = year;
  }

  const sy = String(startYear).slice(-2);
  const ey = String(endYear).slice(-2);
  return `${sy}${ey}`;
}

export async function generateInvoiceNumber(
  tx: Prisma.TransactionClient,
  date: Date = new Date()
): Promise<string> {
  const fy = getIndianFinancialYear(date);
  const prefix = `INV-${fy}-`;

  const latestInvoice = await tx.invoice.findFirst({
    where: {
      invoiceNumber: { startsWith: prefix },
    },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });

  let nextSequence = 1;
  if (latestInvoice && latestInvoice.invoiceNumber) {
    const parts = latestInvoice.invoiceNumber.split("-");
    const lastSeqStr = parts[2];
    if (lastSeqStr) {
      const parsed = parseInt(lastSeqStr, 10);
      if (!isNaN(parsed)) {
        nextSequence = parsed + 1;
      }
    }
  }

  return `${prefix}${String(nextSequence).padStart(4, "0")}`;
}

// -----------------------------------------------------------------------------
// INVOICE QUERIES & STATS
// -----------------------------------------------------------------------------

export interface InvoiceQueryParams extends QueryParams {
  clientId?: string;
  status?: InvoiceStatus;
  dateFrom?: string;
  dateTo?: string;
}

export async function getInvoices(params: InvoiceQueryParams) {
  const { skip, take, search, sortBy, sortOrder } = parsePaginationParams(params);

  const where: Prisma.InvoiceWhereInput = {
    ...(search
      ? {
          OR: [
            { invoiceNumber: { contains: search } },
            { client: { name: { contains: search } } },
            { client: { code: { contains: search } } },
            { dispatch: { dispatchNumber: { contains: search } } },
          ],
        }
      : {}),
    ...(params.clientId ? { clientId: params.clientId } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.dateFrom || params.dateTo
      ? {
          invoiceDate: {
            ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
            ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.invoice.count({ where }),
    db.invoice.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy === "createdAt" ? "invoiceDate" : sortBy]: sortOrder },
      include: {
        client: true,
        dispatch: { select: { dispatchNumber: true, vehicleNumber: true } },
        lines: true,
      },
    }),
  ]);

  return buildPaginatedResponse(rows, total, Math.floor(skip / take) + 1, take);
}

export async function getInvoiceSummaryStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [monthSumRes, totalInvoicesCount] = await Promise.all([
    db.invoice.aggregate({
      where: {
        invoiceDate: { gte: startOfMonth },
        status: { not: InvoiceStatus.CANCELLED },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    }),
    db.invoice.count({
      where: { status: { not: InvoiceStatus.CANCELLED } },
    }),
  ]);

  const invoicedThisMonth = Number(monthSumRes._sum.totalAmount || 0);
  const monthCount = monthSumRes._count.id;
  const avgInvoiceValue = monthCount > 0 ? invoicedThisMonth / monthCount : 0;

  return {
    invoicedThisMonth,
    totalInvoicesCount,
    avgInvoiceValue: Number(avgInvoiceValue.toFixed(2)),
  };
}

export async function getInvoiceById(id: string) {
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: {
      client: true,
      dispatch: {
        include: {
          loadBatch: {
            include: { truck: true, transporter: true },
          },
        },
      },
      lines: {
        include: {
          orderItem: {
            include: { order: true },
          },
        },
      },
      createdBy: { select: { id: true, name: true, role: true } },
    },
  });

  return invoice;
}

// -----------------------------------------------------------------------------
// GENERATE INVOICES FROM DISPATCH (1 INVOICE PER CLIENT)
// -----------------------------------------------------------------------------

export async function createInvoicesFromDispatch(dispatchId: string) {
  const { userId } = await requireRole(Role.ADMIN, Role.DISPATCH);

  const dispatch = await db.dispatch.findUnique({
    where: { id: dispatchId },
    include: {
      loadBatch: {
        include: {
          orders: {
            include: {
              order: {
                include: {
                  client: true,
                  items: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!dispatch || !dispatch.loadBatch) {
    throw new Error("Dispatch record not found.");
  }

  // Check if invoices already exist for this dispatch
  const existingInvoices = await db.invoice.findMany({
    where: { dispatchId },
  });

  if (existingInvoices.length > 0) {
    return existingInvoices; // Idempotent
  }

  const millState = (process.env.MILL_STATE || "Rajasthan").trim().toLowerCase();

  const createdInvoices = await db.$transaction(async (tx) => {
    const results: any[] = [];

    // Group items by client
    const clientItemsMap = new Map<string, { client: any; items: any[] }>();

    for (const lo of dispatch.loadBatch!.orders) {
      const c = lo.order.client;
      const prev = clientItemsMap.get(c.id) || { client: c, items: [] };

      for (const it of lo.order.items) {
        prev.items.push(it);
      }
      clientItemsMap.set(c.id, prev);
    }

    for (const [clientId, data] of clientItemsMap.entries()) {
      const client = data.client;
      const invoiceNumber = await generateInvoiceNumber(tx);

      // Line items & Taxable computation
      let subtotal = 0;
      const linesData = data.items.map((it) => {
        const qtyKg = Number(it.dispatchedKg > 0 ? it.dispatchedKg : it.quantityKg);
        const ratePerKg = Number(it.ratePerKg || 38.50); // Default â‚¹38.50/kg if rate not set
        const lineAmount = Number((qtyKg * ratePerKg).toFixed(2));
        subtotal += lineAmount;

        return {
          orderItemId: it.id,
          description: `Kraft Paper ${it.gsm} GSM - ${Number(it.widthInch).toFixed(2)}" Reel (HSN 4804)`,
          quantityKg: new Prisma.Decimal(qtyKg.toFixed(3)),
          ratePerKg: new Prisma.Decimal(ratePerKg.toFixed(2)),
          amount: new Prisma.Decimal(lineAmount.toFixed(2)),
        };
      });

      // GST Computation: Compare Mill State with Client State
      const clientState = (client.state || "").trim().toLowerCase();
      const isIntraState = millState === clientState;

      let cgst = 0;
      let sgst = 0;
      let igst = 0;

      if (isIntraState) {
        cgst = Number((subtotal * 0.09).toFixed(2));
        sgst = Number((subtotal * 0.09).toFixed(2));
      } else {
        igst = Number((subtotal * 0.18).toFixed(2));
      }

      const totalAmount = Math.round(subtotal + cgst + sgst + igst);

      const createdInvoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          clientId,
          dispatchId,
          loadBatchId: dispatch.loadBatchId,
          invoiceDate: new Date(),
          subtotal: new Prisma.Decimal(subtotal.toFixed(2)),
          cgst: new Prisma.Decimal(cgst.toFixed(2)),
          sgst: new Prisma.Decimal(sgst.toFixed(2)),
          igst: new Prisma.Decimal(igst.toFixed(2)),
          totalAmount: new Prisma.Decimal(totalAmount.toFixed(2)),
          status: InvoiceStatus.ISSUED,
          createdById: userId,
          lines: {
            create: linesData,
          },
        },
        include: {
          client: true,
          lines: true,
        },
      });

      await logAudit(
        {
          userId,
          entityType: "Invoice",
          entityId: createdInvoice.id,
          action: "GENERATE_INVOICE",
          after: {
            invoiceNumber: createdInvoice.invoiceNumber,
            clientName: client.name,
            totalAmount,
            dispatchNumber: dispatch.dispatchNumber,
          },
        },
        tx
      );

      results.push(createdInvoice);
    }

    return results;
  });

  revalidatePath("/invoices");
  revalidatePath("/dispatch/history");
  return createdInvoices;
}

export async function cancelInvoice(invoiceId: string, reason: string) {
  const { userId } = await requireRole(Role.ADMIN);

  if (!reason || reason.trim().length === 0) {
    throw new Error("Mandatory cancellation reason is required to cancel an invoice.");
  }

  const existing = await db.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!existing) throw new Error("Invoice not found.");
  if (existing.status === InvoiceStatus.CANCELLED) {
    throw new Error("Invoice is already cancelled.");
  }

  const updated = await db.$transaction(async (tx) => {
    const res = await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.CANCELLED },
    });

    await logAudit(
      {
        userId,
        entityType: "Invoice",
        entityId: invoiceId,
        action: "CANCEL_INVOICE",
        before: { status: existing.status },
        after: { status: res.status, reason },
      },
      tx
    );

    return res;
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return updated;
}
