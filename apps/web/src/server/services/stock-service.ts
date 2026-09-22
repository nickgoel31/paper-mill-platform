"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role, StockStatus, OrderStatus, PaperType, PaperSize, LengthUnit, Prisma } from "@/generated/prisma/browser";
import { logAudit } from "./audit-service";
import {
  QueryParams,
  parsePaginationParams,
  buildPaginatedResponse,
} from "./base-service";
import { revalidatePath } from "next/cache";
import { toInches } from "@/lib/units";
import { getSystemSettings } from "./settings-service";

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

export interface StockQueryParams extends QueryParams {
  gsm?: number;
  paperType?: PaperType;
  size?: PaperSize;
  minWidth?: number;
  maxWidth?: number;
  status?: StockStatus;
  location?: string;
  dateFrom?: string;
  dateTo?: string;
}

function buildStockWhere(params: StockQueryParams, search: string): Prisma.StockItemWhereInput {
  return {
    ...(search
      ? {
          OR: [
            { reelNumber: { contains: search } },
            { location: { contains: search } },
            { productionRun: { runNumber: { contains: search } } },
            { orderItem: { order: { orderNumber: { contains: search } } } },
            { orderItem: { order: { client: { name: { contains: search } } } } },
          ],
        }
      : {}),
    ...(params.gsm ? { gsm: Number(params.gsm) } : {}),
    ...(params.paperType ? { paperType: params.paperType } : {}),
    ...(params.size ? { size: params.size } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.location ? { location: { contains: params.location } } : {}),
    ...(params.minWidth || params.maxWidth
      ? {
          widthInch: {
            ...(params.minWidth ? { gte: new Prisma.Decimal(params.minWidth) } : {}),
            ...(params.maxWidth ? { lte: new Prisma.Decimal(params.maxWidth) } : {}),
          },
        }
      : {}),
    ...(params.dateFrom || params.dateTo
      ? {
          createdAt: {
            ...(params.dateFrom ? { gte: startOfDay(params.dateFrom) } : {}),
            // Inclusive of the whole "to" day, not just its midnight instant.
            ...(params.dateTo ? { lt: endOfDayExclusive(params.dateTo) } : {}),
          },
        }
      : {}),
  };
}

const STOCK_LIST_INCLUDE = {
  productionRun: {
    select: {
      id: true,
      runNumber: true,
      machine: { select: { name: true, code: true } },
    },
  },
  orderItem: {
    select: {
      id: true,
      widthInch: true,
      gsm: true,
      quantityKg: true,
      producedKg: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          client: { select: { name: true, code: true, city: true } },
        },
      },
    },
  },
} as const;

export async function getStockItems(params: StockQueryParams) {
  const { skip, take, search, sortBy, sortOrder } = parsePaginationParams(params);
  const where = buildStockWhere(params, search);

  const [total, rows] = await Promise.all([
    db.stockItem.count({ where }),
    db.stockItem.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy === "createdAt" ? "createdAt" : sortBy]: sortOrder },
      include: STOCK_LIST_INCLUDE,
    }),
  ]);

  return buildPaginatedResponse(rows, total, Math.floor(skip / take) + 1, take);
}

export async function getStockSummaryStats() {
  const [availableRes, allocatedRes, distinctCombos, oldestItem] = await Promise.all([
    db.stockItem.aggregate({
      where: { status: StockStatus.AVAILABLE },
      _sum: { quantityKg: true },
      _count: { id: true },
    }),
    db.stockItem.aggregate({
      where: { status: StockStatus.ALLOCATED },
      _sum: { quantityKg: true },
      _count: { id: true },
    }),
    db.stockItem.findMany({
      where: { status: { in: [StockStatus.AVAILABLE, StockStatus.ALLOCATED] } },
      select: { gsm: true, widthInch: true, paperType: true },
      distinct: ["gsm", "widthInch", "paperType"],
    }),
    db.stockItem.findFirst({
      where: { status: StockStatus.AVAILABLE },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  const totalAvailableKg = Number(availableRes._sum.quantityKg || 0);
  const totalAllocatedKg = Number(allocatedRes._sum.quantityKg || 0);
  const availableCount = availableRes._count.id;
  const allocatedCount = allocatedRes._count.id;
  const distinctSkusCount = distinctCombos.length;

  let oldestStockDays = 0;
  if (oldestItem) {
    const ageMs = Date.now() - new Date(oldestItem.createdAt).getTime();
    oldestStockDays = Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)));
  }

  return {
    totalAvailableKg,
    totalAllocatedKg,
    availableCount,
    allocatedCount,
    distinctSkusCount,
    oldestStockDays,
  };
}

/**
 * Opening/closing stock for one calendar day, derived from what we actually
 * track (inward date + current status/last-updated) rather than a full
 * day-by-day ledger:
 *  - Opening stock  = reels already inward before the day started, and not
 *    yet DISPATCHED before the day started.
 *  - Closing stock  = the same, evaluated at the end of the day instead.
 *  - Inward / Dispatched = movement that happened during the day itself.
 * A reel whose quantity was manually adjusted (Admin qty correction) is
 * counted at its current quantity throughout — there's no historical ledger
 * for manual adjustments, only for inward/dispatch events.
 */
export async function getStockDateSummary(dateStr: string) {
  if (!dateStr || isNaN(new Date(dateStr).getTime())) {
    throw new Error("A valid date is required.");
  }
  const dayStart = startOfDay(dateStr);
  const dayEnd = endOfDayExclusive(dateStr);

  const notYetDispatchedBefore = (cutoff: Date): Prisma.StockItemWhereInput => ({
    createdAt: { lt: cutoff },
    OR: [
      { status: { not: StockStatus.DISPATCHED } },
      { status: StockStatus.DISPATCHED, updatedAt: { gte: cutoff } },
    ],
  });

  const [opening, closing, inward, dispatched] = await Promise.all([
    db.stockItem.aggregate({
      where: notYetDispatchedBefore(dayStart),
      _sum: { quantityKg: true },
      _count: { id: true },
    }),
    db.stockItem.aggregate({
      where: notYetDispatchedBefore(dayEnd),
      _sum: { quantityKg: true },
      _count: { id: true },
    }),
    db.stockItem.aggregate({
      where: { createdAt: { gte: dayStart, lt: dayEnd } },
      _sum: { quantityKg: true },
      _count: { id: true },
    }),
    db.stockItem.aggregate({
      where: { status: StockStatus.DISPATCHED, updatedAt: { gte: dayStart, lt: dayEnd } },
      _sum: { quantityKg: true },
      _count: { id: true },
    }),
  ]);

  return {
    date: dateStr,
    openingStockKg: Number(opening._sum.quantityKg || 0),
    openingCount: opening._count.id,
    closingStockKg: Number(closing._sum.quantityKg || 0),
    closingCount: closing._count.id,
    inwardKg: Number(inward._sum.quantityKg || 0),
    inwardCount: inward._count.id,
    dispatchedKg: Number(dispatched._sum.quantityKg || 0),
    dispatchedCount: dispatched._count.id,
  };
}

/**
 * Every stock row matching the given filters (up to a 5,000-row safety cap),
 * unpaginated — used only to build the CSV export so it covers everything
 * the filters select, not just the current page.
 */
export async function getStockItemsForExport(params: StockQueryParams) {
  const { search } = parsePaginationParams(params);
  const where = buildStockWhere(params, search);

  return db.stockItem.findMany({
    where,
    take: 5000,
    orderBy: { createdAt: "desc" },
    include: STOCK_LIST_INCLUDE,
  });
}

export async function getPendingEligibleOrderItemsForStock(
  widthInch: number,
  gsm: number,
  paperType?: PaperType,
  size?: PaperSize
) {
  const widthDec = new Prisma.Decimal(widthInch.toFixed(2));

  const items = await db.orderItem.findMany({
    where: {
      gsm,
      widthInch: widthDec,
      // A Natural reel only fits Natural lines, and a BY reel only BY lines.
      // Same for size — a Baby reel only fits a Baby line, etc.
      ...(paperType ? { paperType } : {}),
      ...(size ? { size } : {}),
      order: {
        status: { in: [OrderStatus.CONFIRMED, OrderStatus.PLANNED, OrderStatus.IN_PRODUCTION] },
      },
    },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          deliveryDate: true,
          priority: true,
          status: true,
          client: {
            select: { id: true, name: true, code: true, city: true },
          },
        },
      },
    },
    orderBy: [
      { order: { priority: "desc" } },
      { order: { deliveryDate: "asc" } },
    ],
  });

  return items.map((it) => ({
    id: it.id,
    orderId: it.order.id,
    orderNumber: it.order.orderNumber,
    clientName: it.order.client.name,
    clientCity: it.order.client.city,
    widthInch: Number(it.widthInch),
    gsm: it.gsm,
    quantityKg: Number(it.quantityKg),
    tolerancePercent: Number(it.tolerancePercent),
    producedKg: Number(it.producedKg || 0),
    deliveryDate: it.order.deliveryDate,
    priority: it.order.priority,
  }));
}

// -----------------------------------------------------------------------------
// STOCK MUTATIONS & ALLOCATIONS (ATOMIC TRANSACTIONS)
// -----------------------------------------------------------------------------

/**
 * "<prefix>-2609-0001", monthly-reset — same convention as Order.orderNumber.
 * The prefix is a per-mill setting (Settings -> Reel Number Prefix).
 */
export async function generateReelNumber(
  tx: Prisma.TransactionClient,
  reelPrefix: string,
  date: Date = new Date()
): Promise<string> {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const prefix = `${reelPrefix || "REEL"}-${yy}${mm}-`;

  const latest = await tx.stockItem.findFirst({
    where: { reelNumber: { startsWith: prefix } },
    orderBy: { reelNumber: "desc" },
    select: { reelNumber: true },
  });

  let nextSequence = 1;
  const lastSeqStr = latest?.reelNumber?.split("-").pop();
  if (lastSeqStr) {
    const parsed = parseInt(lastSeqStr, 10);
    if (!isNaN(parsed)) nextSequence = parsed + 1;
  }

  return `${prefix}${String(nextSequence).padStart(4, "0")}`;
}

export async function createStockItem(input: {
  /** Value as typed, in `widthUnit` (defaults to inches for old callers). */
  widthInch: number;
  widthUnit?: LengthUnit;
  gsm: number;
  quantityKg: number;
  location?: string;
  orderItemId?: string;
  paperType?: PaperType;
  size?: PaperSize;
}) {
  const { userId } = await requireRole(
    Role.ADMIN,
    Role.PLANNER,
    Role.DISPATCH,
    Role.OPERATOR,
    Role.SALES
  );

  if (input.quantityKg <= 0) {
    throw new Error("Stock quantity must be greater than zero.");
  }
  if (input.widthInch <= 0) {
    throw new Error("Width must be greater than zero.");
  }

  const widthUnit = input.widthUnit ?? LengthUnit.INCH;
  const widthInches = toInches(input.widthInch, widthUnit);

  const isAllocated = Boolean(input.orderItemId && input.orderItemId !== "none");
  let paperType = input.paperType ?? PaperType.NATURAL;
  let size = input.size ?? PaperSize.NORMAL;

  // A reel pre-linked to an order line must be the same paper type/size as that line.
  if (isAllocated && input.orderItemId) {
    const line = await db.orderItem.findFirst({
      where: { id: input.orderItemId },
      select: { paperType: true, size: true },
    });
    if (line && input.paperType && input.paperType !== line.paperType) {
      throw new Error(
        `Paper type mismatch: the linked order line is ${line.paperType}, but this reel is ${input.paperType}.`
      );
    }
    if (line && input.size && input.size !== line.size) {
      throw new Error(
        `Size mismatch: the linked order line is ${line.size}, but this reel is ${input.size}.`
      );
    }
    if (line) {
      paperType = line.paperType;
      size = line.size;
    }
  }

  const { reelNumberPrefix } = await getSystemSettings();

  const created = await db.$transaction(async (tx) => {
    const reelNumber = await generateReelNumber(tx, reelNumberPrefix);
    const item = await tx.stockItem.create({
      data: {
        reelNumber,
        widthInch: new Prisma.Decimal(widthInches.toFixed(2)),
        enteredWidth: new Prisma.Decimal(input.widthInch.toFixed(2)),
        enteredWidthUnit: widthUnit,
        gsm: input.gsm,
        paperType,
        size,
        quantityKg: new Prisma.Decimal(input.quantityKg.toFixed(3)),
        status: isAllocated ? StockStatus.ALLOCATED : StockStatus.AVAILABLE,
        location: input.location || "WAREHOUSE-BAY-A",
        orderItemId: isAllocated ? input.orderItemId : null,
      },
    });

    if (isAllocated && input.orderItemId) {
      await tx.orderItem.update({
        where: { id: input.orderItemId },
        data: {
          producedKg: {
            increment: new Prisma.Decimal(input.quantityKg.toFixed(3)),
          },
        },
      });
    }

    await logAudit(
      {
        userId,
        entityType: "StockItem",
        entityId: item.id,
        action: "CREATE",
        after: {
          widthInch: input.widthInch,
          gsm: input.gsm,
          quantityKg: input.quantityKg,
          location: input.location,
        },
      },
      tx
    );

    return item;
  });

  revalidatePath("/stock");
  return created;
}

// -----------------------------------------------------------------------------
// CSV IMPORT
// -----------------------------------------------------------------------------

/**
 * Bulk-create warehouse stock reels from parsed CSV rows. `reelNumber` is
 * optional per row — give your own (e.g. carried over from a legacy system) or
 * leave it blank to auto-generate one. `orderNumber` is also optional — give
 * it to allocate the reel straight to that order's matching line (by width +
 * GSM); leave it blank for unassigned buffer stock. Every row is independent:
 * a bad row is reported and skipped rather than failing the whole file.
 */
export async function importStockItemsCsv(rows: Record<string, string>[]) {
  const { userId } = await requireRole(
    Role.ADMIN,
    Role.PLANNER,
    Role.DISPATCH,
    Role.OPERATOR,
    Role.SALES
  );
  const { reelNumberPrefix } = await getSystemSettings();

  const errors: { row: number; message: string }[] = [];
  let created = 0;
  const usedReelNumbers = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // account for the header row
    const r = rows[i];
    try {
      const widthRaw = parseFloat(r.widthInch);
      const gsm = parseInt(r.gsm, 10);
      const quantityKg = parseFloat(r.quantityKg);
      const widthUnit = (r.widthUnit || "").toUpperCase() === "CM" ? LengthUnit.CM : LengthUnit.INCH;
      let paperType = (r.paperType || "").toUpperCase() === "BY" ? PaperType.BY : PaperType.NATURAL;
      let size = (r.size || "").toUpperCase() === "BABY" ? PaperSize.BABY : PaperSize.NORMAL;
      const reelNumber = r.reelNumber?.trim() || "";
      const orderNumber = r.orderNumber?.trim() || "";

      if (isNaN(widthRaw) || widthRaw <= 0) throw new Error(`Invalid "widthInch": "${r.widthInch}"`);
      if (isNaN(gsm) || gsm <= 0) throw new Error(`Invalid "gsm": "${r.gsm}"`);
      if (isNaN(quantityKg) || quantityKg <= 0) throw new Error(`Invalid "quantityKg": "${r.quantityKg}"`);

      let finalReelNumber = reelNumber;
      if (finalReelNumber) {
        if (usedReelNumbers.has(finalReelNumber)) {
          throw new Error(`Reel number "${finalReelNumber}" is duplicated within this file.`);
        }
        const existing = await db.stockItem.findFirst({ where: { reelNumber: finalReelNumber } });
        if (existing) throw new Error(`Reel number "${finalReelNumber}" is already in use.`);
      }

      // Optional allocation: find the matching line (by width + GSM) on the
      // named order. The reel then takes that line's paper type, same as
      // allocating an existing reel does.
      let orderItemId: string | null = null;
      if (orderNumber) {
        const order = await db.order.findFirst({
          where: { orderNumber },
          include: { items: true },
        });
        if (!order) throw new Error(`No order found with number "${orderNumber}".`);

        const widthInches = toInches(widthRaw, widthUnit);
        const match = order.items.find(
          (it) => it.gsm === gsm && Math.abs(Number(it.widthInch) - widthInches) < 0.01
        );
        if (!match) {
          throw new Error(
            `Order "${orderNumber}" has no line matching ${gsm} GSM at this width.`
          );
        }
        orderItemId = match.id;
        paperType = match.paperType;
        size = match.size;
      }

      await db.$transaction(async (tx) => {
        if (!finalReelNumber) {
          finalReelNumber = await generateReelNumber(tx, reelNumberPrefix);
        }
        const item = await tx.stockItem.create({
          data: {
            reelNumber: finalReelNumber,
            widthInch: new Prisma.Decimal(toInches(widthRaw, widthUnit).toFixed(2)),
            enteredWidth: new Prisma.Decimal(widthRaw.toFixed(2)),
            enteredWidthUnit: widthUnit,
            gsm,
            paperType,
            size,
            quantityKg: new Prisma.Decimal(quantityKg.toFixed(3)),
            status: orderItemId ? StockStatus.ALLOCATED : StockStatus.AVAILABLE,
            location: r.location?.trim() || "WAREHOUSE-BAY-A",
            orderItemId,
          },
        });
        if (orderItemId) {
          await tx.orderItem.update({
            where: { id: orderItemId },
            data: { producedKg: { increment: new Prisma.Decimal(quantityKg.toFixed(3)) } },
          });
        }
        await logAudit(
          { userId, entityType: "StockItem", entityId: item.id, action: "CREATE", after: { source: "CSV import" } },
          tx
        );
      });

      usedReelNumbers.add(finalReelNumber);
      created++;
    } catch (err: any) {
      errors.push({ row: rowNum, message: err.message || "Failed to import row" });
    }
  }

  if (created > 0) revalidatePath("/stock");
  return { created, errors };
}

export async function adjustStockQuantity(
  stockItemId: string,
  deltaKg: number,
  reason: string
) {
  const { userId } = await requireRole(Role.ADMIN);

  if (!reason || reason.trim().length === 0) {
    throw new Error("Mandatory adjustment reason is required for manual stock edits.");
  }

  const existing = await db.stockItem.findFirst({
    where: { id: stockItemId },
  });

  if (!existing) {
    throw new Error("Stock item not found.");
  }

  const currentKg = Number(existing.quantityKg);
  const newKg = currentKg + deltaKg;

  if (newKg < 0) {
    throw new Error(
      `Cannot reduce stock by ${Math.abs(deltaKg)} kg. Current quantity is only ${currentKg} kg. Quantity cannot be negative.`
    );
  }

  const updated = await db.$transaction(async (tx) => {
    const item = await tx.stockItem.update({
      where: { id: stockItemId },
      data: {
        quantityKg: new Prisma.Decimal(newKg.toFixed(3)),
      },
    });

    await logAudit(
      {
        userId,
        entityType: "StockItem",
        entityId: stockItemId,
        action: "MANUAL_ADJUSTMENT",
        before: { quantityKg: currentKg },
        after: {
          quantityKg: newKg,
          deltaKg,
          reason,
        },
      },
      tx
    );

    return item;
  });

  revalidatePath("/stock");
  return updated;
}

export async function allocateStockToOrderItem(
  stockItemId: string,
  orderItemId: string
) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER, Role.DISPATCH);

  const [stock, orderItem] = await Promise.all([
    db.stockItem.findFirst({ where: { id: stockItemId } }),
    db.orderItem.findFirst({
      where: { id: orderItemId },
      include: { order: true },
    }),
  ]);

  if (!stock) throw new Error("Stock item not found.");
  if (!orderItem) throw new Error("Target Order item not found.");

  if (stock.status !== StockStatus.AVAILABLE) {
    throw new Error(`Only AVAILABLE stock can be allocated. Current status: ${stock.status}`);
  }

  // Exact matching validation
  if (
    Number(stock.widthInch) !== Number(orderItem.widthInch) ||
    stock.gsm !== orderItem.gsm
  ) {
    throw new Error(
      `Mismatch: Stock (${stock.widthInch}" @ ${stock.gsm} GSM) does not match order item (${orderItem.widthInch}" @ ${orderItem.gsm} GSM).`
    );
  }
  if (stock.paperType !== orderItem.paperType) {
    throw new Error(
      `Mismatch: Stock is ${stock.paperType} paper but the order item is ${orderItem.paperType}.`
    );
  }
  if (stock.size !== orderItem.size) {
    throw new Error(
      `Mismatch: Stock is ${stock.size} size but the order item is ${orderItem.size}.`
    );
  }

  const stockKg = Number(stock.quantityKg);

  const result = await db.$transaction(async (tx) => {
    // 1. Move Stock to ALLOCATED
    const updatedStock = await tx.stockItem.update({
      where: { id: stockItemId },
      data: {
        status: StockStatus.ALLOCATED,
        orderItemId: orderItemId,
      },
    });

    // 2. Increment OrderItem.producedKg
    const updatedOrderItem = await tx.orderItem.update({
      where: { id: orderItemId },
      data: {
        producedKg: { increment: new Prisma.Decimal(stockKg.toFixed(3)) },
      },
    });

    // 3. Check Order Fulfillment status
    const allItems = await tx.orderItem.findMany({
      where: { orderId: orderItem.orderId },
    });

    const isAllFulfilled = allItems.every((it) => {
      const demand = Number(it.quantityKg);
      const tol = Number(it.tolerancePercent || 5.0);
      const minAcceptable = demand * (1.0 - tol / 100.0);
      const prod =
        it.id === orderItemId
          ? Number(it.producedKg) + stockKg
          : Number(it.producedKg || 0);
      return prod >= minAcceptable;
    });

    if (isAllFulfilled) {
      await tx.order.update({
        where: { id: orderItem.orderId },
        data: { status: OrderStatus.PRODUCED },
      });
    } else {
      await tx.order.update({
        where: { id: orderItem.orderId },
        data: { status: OrderStatus.IN_PRODUCTION },
      });
    }

    // 4. Audit Log
    await logAudit(
      {
        userId,
        entityType: "StockItem",
        entityId: stockItemId,
        action: "ALLOCATE_TO_ORDER",
        after: {
          orderItemId,
          orderNumber: orderItem.order.orderNumber,
          allocatedKg: stockKg,
        },
      },
      tx
    );

    return { updatedStock, updatedOrderItem };
  });

  revalidatePath("/stock");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderItem.orderId}`);
  return result;
}

export async function deallocateStock(stockItemId: string, reason?: string) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER, Role.DISPATCH);

  const stock = await db.stockItem.findFirst({
    where: { id: stockItemId },
    include: {
      orderItem: { include: { order: true } },
    },
  });

  if (!stock) throw new Error("Stock item not found.");
  if (stock.status !== StockStatus.ALLOCATED || !stock.orderItemId) {
    throw new Error("This stock item is not currently allocated to an order.");
  }

  const orderItemId = stock.orderItemId;
  const orderId = stock.orderItem?.orderId;
  const stockKg = Number(stock.quantityKg);

  const result = await db.$transaction(async (tx) => {
    // 1. Move Stock back to AVAILABLE
    const updatedStock = await tx.stockItem.update({
      where: { id: stockItemId },
      data: {
        status: StockStatus.AVAILABLE,
        orderItemId: null,
      },
    });

    // 2. Decrement OrderItem.producedKg (ensure never negative)
    const currentItem = await tx.orderItem.findFirst({
      where: { id: orderItemId },
    });
    const currentProd = Number(currentItem?.producedKg || 0);
    const newProd = Math.max(0, currentProd - stockKg);

    await tx.orderItem.update({
      where: { id: orderItemId },
      data: {
        producedKg: new Prisma.Decimal(newProd.toFixed(3)),
      },
    });

    // 3. Revert order status if no longer fulfilled
    if (orderId) {
      const allItems = await tx.orderItem.findMany({
        where: { orderId },
      });

      const isAllFulfilled = allItems.every((it) => {
        const demand = Number(it.quantityKg);
        const tol = Number(it.tolerancePercent || 5.0);
        const minAcceptable = demand * (1.0 - tol / 100.0);
        const prod = it.id === orderItemId ? newProd : Number(it.producedKg || 0);
        return prod >= minAcceptable;
      });

      if (!isAllFulfilled) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.IN_PRODUCTION },
        });
      }
    }

    // 4. Audit Log
    await logAudit(
      {
        userId,
        entityType: "StockItem",
        entityId: stockItemId,
        action: "DEALLOCATE_FROM_ORDER",
        after: {
          revertedOrderItemId: orderItemId,
          revertedKg: stockKg,
          reason: reason || null,
        },
      },
      tx
    );

    return updatedStock;
  });

  revalidatePath("/stock");
  if (orderId) {
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
  }
  return result;
}
