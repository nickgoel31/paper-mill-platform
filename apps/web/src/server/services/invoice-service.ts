"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role, InvoiceStatus, Prisma } from "@/generated/prisma/browser";
import { logAudit } from "./audit-service";
import {
  QueryParams,
  parsePaginationParams,
  buildPaginatedResponse,
} from "./base-service";
import { revalidatePath, revalidateTag } from "next/cache";
import { DASHBOARD_TAG } from "./cache-tags";
import { getSystemSettings } from "./settings-service";
import { sendEmail } from "@/lib/email";

const DEFAULT_DUE_DAYS = 30;

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
        payments: { select: { amount: true } },
      },
    }),
  ]);

  const rowsWithBalance = rows.map((r) => {
    const paid = r.payments.reduce((s, p) => s + Number(p.amount), 0);
    return { ...r, amountPaid: paid, balanceDue: Number(r.totalAmount) - paid };
  });

  return buildPaginatedResponse(rowsWithBalance, total, Math.floor(skip / take) + 1, take);
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
  const invoice = await db.invoice.findFirst({
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
      payments: { orderBy: { paymentDate: "desc" }, include: { recordedBy: { select: { name: true } } } },
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

  const dispatch = await db.dispatch.findFirst({
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

  const { millState: millStateRaw, defaultGstRate } = await getSystemSettings();
  const millState = millStateRaw.trim().toLowerCase();
  const gstRate = defaultGstRate / 100;

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
          description: `Kraft Paper ${it.gsm} GSM - ${Number(it.widthInch).toFixed(2)}" Reel`,
          hsnCode: "4804",
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
        cgst = Number((subtotal * (gstRate / 2)).toFixed(2));
        sgst = Number((subtotal * (gstRate / 2)).toFixed(2));
      } else {
        igst = Number((subtotal * gstRate).toFixed(2));
      }

      const totalAmount = Math.round(subtotal + cgst + sgst + igst);
      const roundOff = Number((totalAmount - (subtotal + cgst + sgst + igst)).toFixed(2));
      if (roundOff !== 0) {
        linesData.push({
          orderItemId: null,
          description: "Round Off",
          quantityKg: new Prisma.Decimal(0),
          ratePerKg: new Prisma.Decimal(0),
          amount: new Prisma.Decimal(roundOff.toFixed(2)),
        } as any);
      }

      const createdInvoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          clientId,
          dispatchId,
          loadBatchId: dispatch.loadBatchId,
          invoiceDate: new Date(),
          dueDate: new Date(Date.now() + DEFAULT_DUE_DAYS * 86400000),
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
  revalidateTag(DASHBOARD_TAG);
  revalidatePath("/dispatch/history");
  return createdInvoices;
}

// -----------------------------------------------------------------------------
// MANUAL / CUSTOM INVOICE CREATION (no dispatch required)
// -----------------------------------------------------------------------------

export interface ManualInvoiceLineInput {
  description: string;
  quantityKg: number;
  ratePerKg: number;
  hsnCode?: string;
}

export async function createManualInvoice(input: {
  clientId: string;
  lines: ManualInvoiceLineInput[];
  invoiceDate?: string;
}) {
  const { userId } = await requireRole(Role.ADMIN, Role.DISPATCH);

  if (!input.lines || input.lines.length === 0) {
    throw new Error("An invoice needs at least one line item.");
  }

  const client = await db.client.findFirst({ where: { id: input.clientId } });
  if (!client) throw new Error("Client not found.");

  const { millState: millStateRaw, defaultGstRate } = await getSystemSettings();
  const millState = millStateRaw.trim().toLowerCase();
  const gstRate = defaultGstRate / 100;
  const isIntraState = millState === (client.state || "").trim().toLowerCase();

  const created = await db.$transaction(async (tx) => {
    const invoiceNumber = await generateInvoiceNumber(tx);

    let subtotal = 0;
    const linesData = input.lines.map((l) => {
      const amount = Number((l.quantityKg * l.ratePerKg).toFixed(2));
      subtotal += amount;
      return {
        description: l.description.slice(0, 500),
        hsnCode: (l.hsnCode || "4804").slice(0, 20),
        quantityKg: new Prisma.Decimal(l.quantityKg.toFixed(3)),
        ratePerKg: new Prisma.Decimal(l.ratePerKg.toFixed(2)),
        amount: new Prisma.Decimal(amount.toFixed(2)),
      };
    });

    let cgst = 0,
      sgst = 0,
      igst = 0;
    if (isIntraState) {
      cgst = Number((subtotal * (gstRate / 2)).toFixed(2));
      sgst = Number((subtotal * (gstRate / 2)).toFixed(2));
    } else {
      igst = Number((subtotal * gstRate).toFixed(2));
    }
    const totalAmount = Math.round(subtotal + cgst + sgst + igst);
    const roundOff = Number((totalAmount - (subtotal + cgst + sgst + igst)).toFixed(2));
    if (roundOff !== 0) {
      linesData.push({
        description: "Round Off",
        quantityKg: new Prisma.Decimal(0),
        ratePerKg: new Prisma.Decimal(0),
        amount: new Prisma.Decimal(roundOff.toFixed(2)),
      } as any);
    }

    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        clientId: input.clientId,
        invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : new Date(),
        dueDate: new Date((input.invoiceDate ? new Date(input.invoiceDate).getTime() : Date.now()) + DEFAULT_DUE_DAYS * 86400000),
        subtotal: new Prisma.Decimal(subtotal.toFixed(2)),
        cgst: new Prisma.Decimal(cgst.toFixed(2)),
        sgst: new Prisma.Decimal(sgst.toFixed(2)),
        igst: new Prisma.Decimal(igst.toFixed(2)),
        totalAmount: new Prisma.Decimal(totalAmount.toFixed(2)),
        status: InvoiceStatus.ISSUED,
        createdById: userId,
        lines: { create: linesData },
      },
      include: { client: true, lines: true },
    });

    await logAudit(
      { userId, entityType: "Invoice", entityId: invoice.id, action: "CREATE_MANUAL_INVOICE", after: { invoiceNumber, totalAmount } },
      tx
    );

    return invoice;
  });

  revalidatePath("/invoices");
  revalidateTag(DASHBOARD_TAG);
  return created;
}

export async function cancelInvoice(invoiceId: string, reason: string) {
  const { userId } = await requireRole(Role.ADMIN);

  if (!reason || reason.trim().length === 0) {
    throw new Error("Mandatory cancellation reason is required to cancel an invoice.");
  }

  const existing = await db.invoice.findFirst({
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
  revalidateTag(DASHBOARD_TAG);
  revalidatePath(`/invoices/${invoiceId}`);
  return updated;
}

// -----------------------------------------------------------------------------
// PAYMENTS / ACCOUNTS RECEIVABLE
// -----------------------------------------------------------------------------

export interface RecordPaymentInput {
  invoiceId: string;
  amount: number;
  paymentDate?: string;
  method?: "CASH" | "BANK_TRANSFER" | "CHEQUE" | "UPI" | "OTHER";
  referenceNumber?: string;
  notes?: string;
}

export async function recordPayment(input: RecordPaymentInput) {
  const { userId } = await requireRole(Role.ADMIN, Role.DISPATCH, Role.SALES);

  if (!input.amount || input.amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const invoice = await db.invoice.findFirst({
    where: { id: input.invoiceId },
    include: { payments: true },
  });
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status === InvoiceStatus.CANCELLED) {
    throw new Error("Cannot record a payment against a cancelled invoice.");
  }

  const alreadyPaid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  const balanceDue = Number(invoice.totalAmount) - alreadyPaid;
  if (input.amount > balanceDue + 0.5) {
    throw new Error(
      `Payment of ₹${input.amount.toFixed(2)} exceeds the outstanding balance of ₹${balanceDue.toFixed(2)}.`
    );
  }

  const payment = await db.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        invoiceId: input.invoiceId,
        amount: new Prisma.Decimal(input.amount.toFixed(2)),
        paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
        method: input.method || "BANK_TRANSFER",
        referenceNumber: input.referenceNumber || null,
        notes: input.notes || null,
        recordedById: userId,
      },
    });

    await logAudit(
      {
        userId,
        entityType: "Invoice",
        entityId: input.invoiceId,
        action: "RECORD_PAYMENT",
        after: { amount: input.amount, method: input.method || "BANK_TRANSFER" },
      },
      tx
    );

    return created;
  });

  revalidatePath(`/invoices/${input.invoiceId}`);
  revalidatePath("/invoices");
  revalidateTag(DASHBOARD_TAG);
  return payment;
}

export async function deletePayment(paymentId: string) {
  const { userId } = await requireRole(Role.ADMIN);

  const payment = await db.payment.findFirst({ where: { id: paymentId } });
  if (!payment) throw new Error("Payment not found.");

  await db.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: paymentId } });
    await logAudit(
      {
        userId,
        entityType: "Invoice",
        entityId: payment.invoiceId,
        action: "DELETE_PAYMENT",
        before: { amount: Number(payment.amount) },
      },
      tx
    );
  });

  revalidatePath(`/invoices/${payment.invoiceId}`);
  revalidatePath("/invoices");
  revalidateTag(DASHBOARD_TAG);
}

export async function getReceivablesAging() {
  const invoices = await db.invoice.findMany({
    where: { status: InvoiceStatus.ISSUED },
    include: { client: { select: { name: true } }, payments: { select: { amount: true } } },
  });

  const now = Date.now();
  const buckets = { notDue: 0, overdue0_30: 0, overdue31_60: 0, overdue61_90: 0, overdue90plus: 0 };
  const rows: {
    invoiceId: string;
    invoiceNumber: string;
    clientName: string;
    invoiceDate: Date;
    dueDate: Date;
    totalAmount: number;
    paid: number;
    balance: number;
    daysOverdue: number;
  }[] = [];
  let totalOutstanding = 0;

  for (const inv of invoices) {
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    const balance = Number(inv.totalAmount) - paid;
    if (balance <= 0.5) continue;

    const dueDate = inv.dueDate ?? new Date(new Date(inv.invoiceDate).getTime() + DEFAULT_DUE_DAYS * 86400000);
    const daysOverdue = Math.floor((now - dueDate.getTime()) / 86400000);

    if (daysOverdue > 90) buckets.overdue90plus += balance;
    else if (daysOverdue > 60) buckets.overdue61_90 += balance;
    else if (daysOverdue > 30) buckets.overdue31_60 += balance;
    else if (daysOverdue > 0) buckets.overdue0_30 += balance;
    else buckets.notDue += balance;

    totalOutstanding += balance;

    rows.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.client.name,
      invoiceDate: inv.invoiceDate,
      dueDate,
      totalAmount: Number(inv.totalAmount),
      paid,
      balance,
      daysOverdue,
    });
  }

  rows.sort((a, b) => b.daysOverdue - a.daysOverdue);

  return { rows, buckets, totalOutstanding };
}

// -----------------------------------------------------------------------------
// EMAIL DELIVERY
// -----------------------------------------------------------------------------

export async function sendInvoiceEmail(invoiceId: string) {
  const { userId } = await requireRole(Role.ADMIN, Role.DISPATCH, Role.SALES);

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId },
    include: { client: true, payments: { select: { amount: true } } },
  });
  if (!invoice) throw new Error("Invoice not found.");
  if (!invoice.client.email) {
    throw new Error("This client has no email address on file. Add one under Clients before emailing.");
  }

  const settings = await getSystemSettings();
  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = Number(invoice.totalAmount) - paid;

  const html = `
    <div style="font-family:sans-serif;max-width:560px;color:#1e293b">
      <h2 style="margin-bottom:4px">Tax Invoice ${invoice.invoiceNumber}</h2>
      <p>Dear ${invoice.client.name},</p>
      <p>Please find your invoice summary below from <strong>${settings.millName}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px">
        <tr><td style="padding:4px 0">Invoice Date</td><td style="text-align:right">${new Date(invoice.invoiceDate).toLocaleDateString("en-IN")}</td></tr>
        <tr><td style="padding:4px 0">Taxable Value</td><td style="text-align:right">₹${Number(invoice.subtotal).toFixed(2)}</td></tr>
        <tr><td style="padding:4px 0">GST</td><td style="text-align:right">₹${(Number(invoice.cgst) + Number(invoice.sgst) + Number(invoice.igst)).toFixed(2)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:bold;border-top:1px solid #ddd">Total Amount</td><td style="text-align:right;font-weight:bold;border-top:1px solid #ddd">₹${Number(invoice.totalAmount).toFixed(2)}</td></tr>
        <tr><td style="padding:4px 0">Amount Paid</td><td style="text-align:right">₹${paid.toFixed(2)}</td></tr>
        <tr><td style="padding:4px 0;font-weight:bold">Balance Due</td><td style="text-align:right;font-weight:bold;color:${balance > 0 ? "#dc2626" : "#16a34a"}">₹${balance.toFixed(2)}</td></tr>
      </table>
      <p style="margin-top:16px;font-size:12px;color:#64748b">This is a system-generated notification. Please arrange payment as per agreed terms.</p>
    </div>
  `;

  const result = await sendEmail({
    to: invoice.client.email,
    subject: `Tax Invoice ${invoice.invoiceNumber} — ${settings.millName}`,
    html,
  });

  if (!result.ok) throw new Error(result.error);

  await logAudit({
    userId,
    entityType: "Invoice",
    entityId: invoiceId,
    action: "EMAIL_INVOICE",
    after: { to: invoice.client.email },
  });

  return { sent: true };
}

// -----------------------------------------------------------------------------
// E-INVOICE (IRN) TRACKING — the IRN itself is issued by a GSP/NIC portal
// after the exported JSON is uploaded there; this just records the result.
// -----------------------------------------------------------------------------

export async function markEinvoiceGenerated(input: {
  invoiceId: string;
  irn: string;
  ackNumber: string;
  ackDate: string;
  qrCodeData?: string;
}) {
  const { userId } = await requireRole(Role.ADMIN, Role.DISPATCH);

  if (!input.irn?.trim() || !input.ackNumber?.trim()) {
    throw new Error("IRN and Acknowledgement Number are required.");
  }

  const updated = await db.invoice.update({
    where: { id: input.invoiceId },
    data: {
      irn: input.irn.trim(),
      ackNumber: input.ackNumber.trim(),
      ackDate: input.ackDate ? new Date(input.ackDate) : new Date(),
      qrCodeData: input.qrCodeData?.trim() || null,
      einvoiceStatus: "GENERATED",
    },
  });

  await logAudit({
    userId,
    entityType: "Invoice",
    entityId: input.invoiceId,
    action: "MARK_EINVOICE_GENERATED",
    after: { irn: input.irn },
  });

  revalidatePath(`/invoices/${input.invoiceId}`);
  return updated;
}

// -----------------------------------------------------------------------------
// DELETE (ADMIN ONLY) — only DRAFT invoices; an ISSUED GST invoice must be
// cancelled (see cancelInvoice), never hard-deleted, for compliance reasons.
// -----------------------------------------------------------------------------

export async function deleteInvoice(id: string) {
  const { userId } = await requireRole(Role.ADMIN);

  const invoice = await db.invoice.findFirst({ where: { id } });
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status !== InvoiceStatus.DRAFT) {
    throw new Error(
      `Invoice ${invoice.invoiceNumber} is ${invoice.status} — issued GST invoices can't be deleted, only cancelled.`
    );
  }

  await db.invoice.delete({ where: { id } });
  await logAudit({
    userId,
    entityType: "Invoice",
    entityId: id,
    action: "DELETE",
    before: { invoiceNumber: invoice.invoiceNumber },
  });

  revalidatePath("/invoices");
  revalidateTag(DASHBOARD_TAG);
}

export async function deleteInvoices(ids: string[]) {
  const { userId } = await requireRole(Role.ADMIN);
  if (!ids || ids.length === 0) throw new Error("No invoices selected.");

  const invoices = await db.invoice.findMany({ where: { id: { in: ids } } });
  const deletable = invoices.filter((i) => i.status === InvoiceStatus.DRAFT);
  const blocked = invoices.filter((i) => i.status !== InvoiceStatus.DRAFT);

  if (deletable.length > 0) {
    await db.invoice.deleteMany({ where: { id: { in: deletable.map((i) => i.id) } } });
    await logAudit({
      userId,
      entityType: "Invoice",
      entityId: "bulk-delete",
      action: "DELETE",
      before: { count: deletable.length, invoiceNumbers: deletable.map((i) => i.invoiceNumber) },
    });
  }

  revalidatePath("/invoices");
  revalidateTag(DASHBOARD_TAG);
  return {
    deleted: deletable.length,
    skipped: blocked.map((i) => ({
      id: i.id,
      label: i.invoiceNumber,
      reason: "Issued invoices can only be cancelled, not deleted.",
    })),
  };
}
