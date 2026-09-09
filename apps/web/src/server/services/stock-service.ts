"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role, StockStatus, OrderStatus, Prisma } from "@/generated/prisma/browser";
import { logAudit } from "./audit-service";
import {
  QueryParams,
  parsePaginationParams,
  buildPaginatedResponse,
} from "./base-service";
import { revalidatePath } from "next/cache";

export interface StockQueryParams extends QueryParams {
  gsm?: number;
  minWidth?: number;
  maxWidth?: number;
  status?: StockStatus;
  location?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function getStockItems(params: StockQueryParams) {
  const { skip, take, search, sortBy, sortOrder } = parsePaginationParams(params);

  const where: Prisma.StockItemWhereInput = {
    ...(search
      ? {
          OR: [
            { location: { contains: search } },
            { productionRun: { runNumber: { contains: search } } },
            { orderItem: { order: { orderNumber: { contains: search } } } },
            { orderItem: { order: { client: { name: { contains: search } } } } },
          ],
        }
      : {}),
    ...(params.gsm ? { gsm: Number(params.gsm) } : {}),
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
            ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
            ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.stockItem.count({ where }),
    db.stockItem.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy === "createdAt" ? "createdAt" : sortBy]: sortOrder },
      include: {
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
      },
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
      select: { gsm: true, widthInch: true },
      distinct: ["gsm", "widthInch"],
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

export async function getPendingEligibleOrderItemsForStock(
  widthInch: number,
  gsm: number
) {
  const widthDec = new Prisma.Decimal(widthInch.toFixed(2));

  const items = await db.orderItem.findMany({
    where: {
      gsm,
      widthInch: widthDec,
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

export async function createStockItem(input: {
  widthInch: number;
  gsm: number;
  quantityKg: number;
  location?: string;
  orderItemId?: string;
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

  const created = await db.$transaction(async (tx) => {
    const isAllocated = Boolean(input.orderItemId && input.orderItemId !== "none");

    const item = await tx.stockItem.create({
      data: {
        widthInch: new Prisma.Decimal(input.widthInch.toFixed(2)),
        gsm: input.gsm,
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
