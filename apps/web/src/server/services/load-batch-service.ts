"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role, LoadStatus, OrderStatus, StockStatus, Prisma } from "@/generated/prisma/browser";
import { logAudit } from "./audit-service";
import {
  QueryParams,
  parsePaginationParams,
  buildPaginatedResponse,
} from "./base-service";
import { loadBatchSchema, LoadBatchInput } from "@/lib/schemas/load-batch";
import { revalidatePath, revalidateTag } from "next/cache";
import { DASHBOARD_TAG } from "./cache-tags";

// -----------------------------------------------------------------------------
// BATCH NUMBER GENERATOR (Monthly Reset: LB-YYMM-0001)
// -----------------------------------------------------------------------------

export async function generateBatchNumber(
  tx: Prisma.TransactionClient,
  date: Date = new Date()
): Promise<string> {
  const d = new Date(date);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const prefix = `LB-${yy}${mm}-`;

  const latestBatch = await tx.loadBatch.findFirst({
    where: {
      batchNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      batchNumber: "desc",
    },
    select: {
      batchNumber: true,
    },
  });

  let nextSequence = 1;
  if (latestBatch && latestBatch.batchNumber) {
    const parts = latestBatch.batchNumber.split("-");
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
// LIST & QUERY ACTIONS
// -----------------------------------------------------------------------------

export interface LoadQueryParams extends QueryParams {
  status?: LoadStatus;
  truckId?: string;
  transporterId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function getLoadBatches(params: LoadQueryParams) {
  const { skip, take, search, sortBy, sortOrder } = parsePaginationParams(params);

  const where: Prisma.LoadBatchWhereInput = {
    ...(search
      ? {
          OR: [
            { batchNumber: { contains: search } },
            { driverName: { contains: search } },
            { truck: { registrationNumber: { contains: search } } },
            { transporter: { name: { contains: search } } },
          ],
        }
      : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.truckId ? { truckId: params.truckId } : {}),
    ...(params.transporterId ? { transporterId: params.transporterId } : {}),
    ...(params.dateFrom || params.dateTo
      ? {
          plannedDispatchDate: {
            ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
            ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.loadBatch.count({ where }),
    db.loadBatch.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy === "createdAt" ? "createdAt" : sortBy]: sortOrder },
      include: {
        truck: true,
        transporter: true,
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
    }),
  ]);

  return buildPaginatedResponse(rows, total, Math.floor(skip / take) + 1, take);
}

/**
 * Orders ready for truck assignment. `totalKg` is the reel weight actually
 * produced and sitting in the warehouse against this order (ALLOCATED stock),
 * not the ordered quantity — a truck should only be loaded with what's really
 * on hand, not what was merely booked.
 */
export async function getUnassignedConfirmedOrders() {
  const orders = await db.order.findMany({
    where: {
      status: {
        in: [
          OrderStatus.CONFIRMED,
          OrderStatus.PLANNED,
          OrderStatus.IN_PRODUCTION,
          OrderStatus.PRODUCED,
        ],
      },
      loadAssignments: {
        none: {
          loadBatch: {
            status: {
              notIn: [LoadStatus.CANCELLED],
            },
          },
        },
      },
      // Only orders with produced reels actually waiting in the warehouse.
      items: { some: { stockItems: { some: { status: StockStatus.ALLOCATED } } } },
    },
    include: {
      client: true,
      items: {
        include: {
          stockItems: { where: { status: StockStatus.ALLOCATED } },
        },
      },
    },
    orderBy: {
      deliveryDate: "asc",
    },
  });

  return orders.map((o) => {
    const totalKg = o.items.reduce(
      (acc, it) => acc + it.stockItems.reduce((s, si) => s + Number(si.quantityKg || 0), 0),
      0
    );
    const distinctGsms = Array.from(new Set(o.items.map((it) => it.gsm)));
    return {
      ...o,
      items: o.items.map(({ stockItems, ...it }) => it),
      totalKg,
      distinctGsms,
    };
  });
}

export async function getLoadBatchById(id: string) {
  const batch = await db.loadBatch.findFirst({
    where: { id },
    include: {
      truck: true,
      transporter: true,
      createdBy: { select: { id: true, name: true, role: true } },
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
  });

  if (!batch) return null;

  // Retrieve timeline audit logs
  const auditLogs = await db.auditLog.findMany({
    where: {
      entityType: "LoadBatch",
      entityId: id,
    },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, role: true } } },
    take: 50,
  });

  return {
    ...batch,
    auditLogs,
  };
}

// -----------------------------------------------------------------------------
// MUTATIONS (Create, Update, Mark Planned, Revert, Cancel)
// -----------------------------------------------------------------------------

export async function createLoadBatch(data: LoadBatchInput) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER, Role.SALES);
  const validated = loadBatchSchema.parse(data);

  // Verify all orders are CONFIRMED and unassigned
  const orders = await db.order.findMany({
    where: { id: { in: validated.orderIds } },
    include: {
      items: true,
      loadAssignments: {
        include: { loadBatch: true },
      },
    },
  });

  if (orders.length !== validated.orderIds.length) {
    throw new Error("One or more selected orders could not be found.");
  }

  for (const o of orders) {
    if (o.status === OrderStatus.CANCELLED || o.status === OrderStatus.DISPATCHED) {
      throw new Error(
        `Order #${o.orderNumber} is in status "${o.status}" and cannot be batched into a truck.`
      );
    }
    const activeBatch = o.loadAssignments.find(
      (la) => la.loadBatch.status !== LoadStatus.CANCELLED
    );
    if (activeBatch) {
      throw new Error(
        `Order #${o.orderNumber} is already assigned to active Load Batch #${activeBatch.loadBatch.batchNumber}.`
      );
    }
  }

  // Calculate total weight
  let totalKg = 0;
  for (const o of orders) {
    for (const item of o.items) {
      totalKg += Number(item.quantityKg) || 0;
    }
  }

  // Verify truck capacity if selected
  if (validated.truckId) {
    const truck = await db.truck.findFirst({ where: { id: validated.truckId } });
    if (truck && totalKg > truck.capacityKg) {
      const overBy = totalKg - truck.capacityKg;
      throw new Error(
        `Selected orders total ${(totalKg / 1000).toFixed(2)} MT, which exceeds truck payload capacity of ${(
          truck.capacityKg / 1000
        ).toFixed(2)} MT by ${(overBy / 1000).toFixed(2)} MT (${overBy.toLocaleString("en-IN")} kg).`
      );
    }
  }

  const batch = await db.$transaction(async (tx) => {
    const batchNumber = await generateBatchNumber(tx, validated.plannedDispatchDate || new Date());

    const created = await tx.loadBatch.create({
      data: {
        batchNumber,
        truckId: validated.truckId || null,
        transporterId: validated.transporterId || null,
        driverName: validated.driverName?.trim() || null,
        driverPhone: validated.driverPhone?.trim() || null,
        status: LoadStatus.DRAFT,
        plannedDispatchDate: validated.plannedDispatchDate || null,
        totalPlannedKg: new Prisma.Decimal(totalKg.toFixed(3)),
        notes: validated.notes?.trim() || null,
        createdById: userId,
        orders: {
          create: validated.orderIds.map((orderId) => ({
            orderId,
          })),
        },
      },
      include: {
        orders: {
          include: {
            order: { include: { client: true } },
          },
        },
      },
    });

    await logAudit(
      {
        userId,
        entityType: "LoadBatch",
        entityId: created.id,
        action: "CREATE",
        after: {
          batchNumber: created.batchNumber,
          orderCount: created.orders.length,
          totalPlannedKg: totalKg,
          status: created.status,
        },
      },
      tx
    );

    return created;
  });

  revalidatePath("/loads");
  revalidatePath("/load-planning");
  revalidateTag(DASHBOARD_TAG);
  return batch;
}

export async function updateLoadBatch(id: string, data: LoadBatchInput) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER, Role.SALES);
  const validated = loadBatchSchema.parse(data);

  const existing = await db.loadBatch.findFirst({
    where: { id },
    include: { orders: true },
  });

  if (!existing) {
    throw new Error("Load batch not found.");
  }

  if (
    existing.status !== LoadStatus.DRAFT &&
    existing.status !== LoadStatus.PLANNED
  ) {
    throw new Error(
      `Load batch #${existing.batchNumber} is in status "${existing.status}" and cannot be modified.`
    );
  }

  // Calculate new total weight
  const orders = await db.order.findMany({
    where: { id: { in: validated.orderIds } },
    include: { items: true },
  });

  let totalKg = 0;
  for (const o of orders) {
    for (const it of o.items) {
      totalKg += Number(it.quantityKg) || 0;
    }
  }

  // Check truck capacity
  if (validated.truckId) {
    const truck = await db.truck.findFirst({ where: { id: validated.truckId } });
    if (truck && totalKg > truck.capacityKg) {
      const overBy = totalKg - truck.capacityKg;
      throw new Error(
        `Selected orders total ${(totalKg / 1000).toFixed(2)} MT, exceeding truck capacity of ${(
          truck.capacityKg / 1000
        ).toFixed(2)} MT by ${(overBy / 1000).toFixed(2)} MT.`
      );
    }
  }

  const updated = await db.$transaction(async (tx) => {
    // Delete existing assignments and recreate
    await tx.loadBatchOrder.deleteMany({ where: { loadBatchId: id } });

    const res = await tx.loadBatch.update({
      where: { id },
      data: {
        truckId: validated.truckId || null,
        transporterId: validated.transporterId || null,
        driverName: validated.driverName?.trim() || null,
        driverPhone: validated.driverPhone?.trim() || null,
        plannedDispatchDate: validated.plannedDispatchDate || null,
        totalPlannedKg: new Prisma.Decimal(totalKg.toFixed(3)),
        notes: validated.notes?.trim() || null,
        orders: {
          create: validated.orderIds.map((orderId) => ({
            orderId,
          })),
        },
      },
      include: {
        orders: { include: { order: { include: { client: true } } } },
      },
    });

    await logAudit(
      {
        userId,
        entityType: "LoadBatch",
        entityId: id,
        action: "UPDATE",
        before: { orderCount: existing.orders.length },
        after: { orderCount: res.orders.length, totalPlannedKg: totalKg },
      },
      tx
    );

    return res;
  });

  revalidatePath(`/loads/${id}`);
  revalidatePath("/loads");
  revalidatePath("/load-planning");
  revalidateTag(DASHBOARD_TAG);
  return updated;
}

export async function markBatchPlanned(id: string) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);

  const existing = await db.loadBatch.findFirst({
    where: { id },
    include: {
      orders: { select: { orderId: true } },
    },
  });

  if (!existing) {
    throw new Error("Load batch not found.");
  }

  if (existing.status !== LoadStatus.DRAFT) {
    throw new Error(`Only DRAFT batches can be marked as PLANNED.`);
  }

  const orderIds = existing.orders.map((o) => o.orderId);

  const updated = await db.$transaction(async (tx) => {
    // 1. Update batch status to PLANNED
    const res = await tx.loadBatch.update({
      where: { id },
      data: { status: LoadStatus.PLANNED },
    });

    // 2. Set all assigned orders to status PLANNED (Business rule requirement)
    await tx.order.updateMany({
      where: { id: { in: orderIds } },
      data: { status: OrderStatus.PLANNED },
    });

    await logAudit(
      {
        userId,
        entityType: "LoadBatch",
        entityId: id,
        action: "STATUS_PLANNED",
        before: { status: existing.status },
        after: { status: res.status, flippedOrdersCount: orderIds.length },
      },
      tx
    );

    return res;
  });

  revalidatePath(`/loads/${id}`);
  revalidatePath("/loads");
  revalidatePath("/load-planning");
  revalidateTag(DASHBOARD_TAG);
  revalidatePath("/orders");
  return updated;
}

export async function revertBatchToDraft(id: string) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);

  const existing = await db.loadBatch.findFirst({
    where: { id },
    include: {
      orders: { select: { orderId: true } },
    },
  });

  if (!existing) {
    throw new Error("Load batch not found.");
  }

  if (existing.status !== LoadStatus.PLANNED) {
    throw new Error(`Only PLANNED batches can be reverted to DRAFT.`);
  }

  const orderIds = existing.orders.map((o) => o.orderId);

  const updated = await db.$transaction(async (tx) => {
    // 1. Revert batch status to DRAFT
    const res = await tx.loadBatch.update({
      where: { id },
      data: { status: LoadStatus.DRAFT },
    });

    // 2. Revert assigned orders back to CONFIRMED
    await tx.order.updateMany({
      where: { id: { in: orderIds } },
      data: { status: OrderStatus.CONFIRMED },
    });

    await logAudit(
      {
        userId,
        entityType: "LoadBatch",
        entityId: id,
        action: "STATUS_DRAFT",
        before: { status: existing.status },
        after: { status: res.status, revertedOrdersCount: orderIds.length },
      },
      tx
    );

    return res;
  });

  revalidatePath(`/loads/${id}`);
  revalidatePath("/loads");
  revalidatePath("/load-planning");
  revalidateTag(DASHBOARD_TAG);
  revalidatePath("/orders");
  return updated;
}

export async function cancelLoadBatch(id: string, reason?: string) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);

  const existing = await db.loadBatch.findFirst({
    where: { id },
    include: {
      orders: { select: { orderId: true } },
    },
  });

  if (!existing) {
    throw new Error("Load batch not found.");
  }

  if (
    existing.status === LoadStatus.DISPATCHED ||
    existing.status === LoadStatus.DELIVERED ||
    existing.status === LoadStatus.CANCELLED
  ) {
    throw new Error(
      `Load batch #${existing.batchNumber} is in status "${existing.status}" and cannot be cancelled.`
    );
  }

  const orderIds = existing.orders.map((o) => o.orderId);

  const updated = await db.$transaction(async (tx) => {
    // 1. Cancel batch
    const res = await tx.loadBatch.update({
      where: { id },
      data: { status: LoadStatus.CANCELLED },
    });

    // 2. Revert all assigned orders back to CONFIRMED so they can be re-batched
    await tx.order.updateMany({
      where: { id: { in: orderIds } },
      data: { status: OrderStatus.CONFIRMED },
    });

    await logAudit(
      {
        userId,
        entityType: "LoadBatch",
        entityId: id,
        action: "CANCEL",
        before: { status: existing.status },
        after: { status: res.status, reason: reason || null },
      },
      tx
    );

    return res;
  });

  revalidatePath(`/loads/${id}`);
  revalidatePath("/loads");
  revalidatePath("/load-planning");
  revalidateTag(DASHBOARD_TAG);
  revalidatePath("/orders");
  return updated;
}
