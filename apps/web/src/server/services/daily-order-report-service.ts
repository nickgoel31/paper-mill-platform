"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role, OrderStatus, StockStatus, Prisma } from "@/generated/prisma/browser";
import { runWithTenantContext, getTenantContextSync } from "@/lib/tenant-context";

function startOfDay(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDayExclusive(dateStr: string): Date {
  const d = startOfDay(dateStr);
  d.setDate(d.getDate() + 1);
  return d;
}

function startOfMonth(dayStart: Date): Date {
  const d = new Date(dayStart);
  d.setDate(1);
  return d;
}

/** Tiny epsilon so float rounding doesn't leave a phantom nonzero row/kg. */
const EPS = 0.005;

/**
 * Computes and upserts the daily order-backlog snapshot for every client in
 * the CURRENT tenant context, for the given date. Idempotent — re-running it
 * for the same date recomputes and overwrites that date's rows (used both by
 * the end-of-day cron and by an on-demand "Generate / Refresh" action for
 * today or a past date).
 *
 * "Open backlog" as of a cutoff = quantityKg minus whatever had already been
 * dispatched (via StockItem transitioning to DISPATCHED) before that cutoff —
 * the same before/after-cutoff technique `getStockDateSummary` uses for
 * stock, applied here per order line via its allocated reels. Cancelled
 * orders are excluded everywhere (not real backlog, not really "received").
 */
async function generateForCurrentTenant(dateStr: string) {
  const dayStart = startOfDay(dateStr);
  const dayEnd = endOfDayExclusive(dateStr);
  const monthStart = startOfMonth(dayStart);

  const clients = await db.client.findMany({
    where: { deletedAt: null },
    select: { id: true, clientType: true },
  });
  if (clients.length === 0) return { rows: 0 };

  const items = await db.orderItem.findMany({
    where: {
      createdAt: { lt: dayEnd },
      order: { status: { not: OrderStatus.CANCELLED } },
    },
    select: {
      id: true,
      quantityKg: true,
      isBookingOnly: true,
      createdAt: true,
      order: { select: { clientId: true } },
    },
  });
  if (items.length === 0) return { rows: 0 };

  const itemIds = items.map((it) => it.id);
  const dispatchEvents = await db.stockItem.findMany({
    where: {
      orderItemId: { in: itemIds },
      status: StockStatus.DISPATCHED,
      updatedAt: { lt: dayEnd },
    },
    select: { orderItemId: true, quantityKg: true, updatedAt: true },
  });

  const dispatchesByItem = new Map<string, Array<{ kg: number; at: Date }>>();
  for (const ev of dispatchEvents) {
    if (!ev.orderItemId) continue;
    const list = dispatchesByItem.get(ev.orderItemId) || [];
    list.push({ kg: Number(ev.quantityKg), at: ev.updatedAt });
    dispatchesByItem.set(ev.orderItemId, list);
  }
  const dispatchedBefore = (itemId: string, cutoff: Date) =>
    (dispatchesByItem.get(itemId) || [])
      .filter((e) => e.at < cutoff)
      .reduce((s, e) => s + e.kg, 0);
  const dispatchedInRange = (itemId: string, from: Date, to: Date) =>
    (dispatchesByItem.get(itemId) || [])
      .filter((e) => e.at >= from && e.at < to)
      .reduce((s, e) => s + e.kg, 0);

  interface Agg {
    clientId: string;
    clientType: string;
    monthQtyKg: number;
    openingKg: number;
    newOrdersKg: number;
    dispatchedKg: number;
    closingKg: number;
    pendingSizesKg: number;
  }
  const byClient = new Map<string, Agg>();
  const clientTypeById = new Map(clients.map((c) => [c.id, c.clientType]));

  for (const it of items) {
    const clientId = it.order.clientId;
    const clientType = clientTypeById.get(clientId);
    if (!clientType) continue; // soft-deleted client — skip

    const agg = byClient.get(clientId) || {
      clientId,
      clientType,
      monthQtyKg: 0,
      openingKg: 0,
      newOrdersKg: 0,
      dispatchedKg: 0,
      closingKg: 0,
      pendingSizesKg: 0,
    };

    const qty = Number(it.quantityKg);
    const createdAt = it.createdAt;

    if (createdAt >= monthStart && createdAt < dayEnd) {
      agg.monthQtyKg += qty;
    }
    if (createdAt < dayStart) {
      agg.openingKg += Math.max(0, qty - dispatchedBefore(it.id, dayStart));
    }
    if (createdAt >= dayStart && createdAt < dayEnd) {
      agg.newOrdersKg += qty;
    }
    agg.dispatchedKg += dispatchedInRange(it.id, dayStart, dayEnd);

    const closingRemaining = Math.max(0, qty - dispatchedBefore(it.id, dayEnd));
    agg.closingKg += closingRemaining;
    if (it.isBookingOnly) {
      agg.pendingSizesKg += closingRemaining;
    }

    byClient.set(clientId, agg);
  }

  const reportDate = dayStart;
  const ctx = getTenantContextSync();
  if (!ctx?.tenantId) return { rows: 0 };
  const tenantId = ctx.tenantId;

  let rows = 0;
  for (const agg of byClient.values()) {
    const hasActivity =
      agg.monthQtyKg > EPS ||
      agg.openingKg > EPS ||
      agg.newOrdersKg > EPS ||
      agg.dispatchedKg > EPS ||
      agg.closingKg > EPS;
    if (!hasActivity) continue;

    const data = {
      clientType: agg.clientType as any,
      monthQtyKg: new Prisma.Decimal(agg.monthQtyKg.toFixed(3)),
      openingKg: new Prisma.Decimal(agg.openingKg.toFixed(3)),
      newOrdersKg: new Prisma.Decimal(agg.newOrdersKg.toFixed(3)),
      dispatchedKg: new Prisma.Decimal(agg.dispatchedKg.toFixed(3)),
      closingKg: new Prisma.Decimal(agg.closingKg.toFixed(3)),
      pendingSizesKg: new Prisma.Decimal(agg.pendingSizesKg.toFixed(3)),
    };

    await db.dailyOrderReportLine.upsert({
      where: {
        tenantId_reportDate_clientId: { tenantId, reportDate, clientId: agg.clientId },
      },
      create: { reportDate, clientId: agg.clientId, ...data },
      update: data,
    });
    rows++;
  }

  return { rows };
}

/**
 * Cron entry point: runs the daily order-backlog snapshot for every active
 * tenant. Called from `/api/cron/daily-order-report`, which the Cloudflare
 * Worker's `scheduled()` handler hits at end-of-day IST (see worker-entry.ts).
 */
export async function generateDailyOrderReportForAllTenants(dateStr?: string) {
  const date = dateStr || new Date().toISOString().slice(0, 10);
  const tenants = await db.tenant.findMany({ where: { isActive: true }, select: { id: true } });

  const details: Array<{ tenantId: string; rows: number }> = [];
  for (const t of tenants) {
    const res = await runWithTenantContext(
      { tenantId: t.id, isPlatform: false },
      () => generateForCurrentTenant(date)
    );
    details.push({ tenantId: t.id, rows: res.rows });
  }

  return { date, tenants: details.length, rows: details.reduce((s, r) => s + r.rows, 0), details };
}

/**
 * On-demand generate/refresh for the current signed-in user's own tenant —
 * used by the Reports page "Generate Now" action (today, or backfilling a
 * past date) instead of waiting for the cron.
 */
export async function generateDailyOrderReport(dateStr: string) {
  await requireRole(Role.ADMIN, Role.SALES, Role.PLANNER, Role.DISPATCH);
  const res = await generateForCurrentTenant(dateStr);
  return { date: dateStr, rows: res.rows };
}

/** All available snapshot dates for the current tenant, most recent first. */
export async function listDailyOrderReportDates() {
  await requireRole(Role.ADMIN, Role.SALES, Role.PLANNER, Role.DISPATCH);
  const rows = await db.dailyOrderReportLine.findMany({
    distinct: ["reportDate"],
    select: { reportDate: true },
    orderBy: { reportDate: "desc" },
    take: 60,
  });
  return rows.map((r) => r.reportDate.toISOString().slice(0, 10));
}

/** The stored snapshot for one date, with client name/city joined in. */
export async function getDailyOrderReport(dateStr: string) {
  await requireRole(Role.ADMIN, Role.SALES, Role.PLANNER, Role.DISPATCH);
  const reportDate = startOfDay(dateStr);

  const rows = await db.dailyOrderReportLine.findMany({
    where: { reportDate },
    include: { client: { select: { name: true, code: true, city: true } } },
    orderBy: [{ clientType: "asc" }],
  });

  return rows.map((r) => ({
    clientId: r.clientId,
    clientName: r.client.name,
    clientCode: r.client.code,
    clientCity: r.client.city,
    clientType: r.clientType,
    monthQtyKg: Number(r.monthQtyKg),
    openingKg: Number(r.openingKg),
    newOrdersKg: Number(r.newOrdersKg),
    dispatchedKg: Number(r.dispatchedKg),
    closingKg: Number(r.closingKg),
    pendingSizesKg: Number(r.pendingSizesKg),
  }));
}
