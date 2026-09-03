"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role, OrderStatus, OrderPriority, PaperType, Prisma } from "@/generated/prisma/browser";
import { logAudit } from "./audit-service";
import {
  QueryParams,
  parsePaginationParams,
  buildPaginatedResponse,
} from "./base-service";
import {
  orderFormSchema,
  statusTransitionSchema,
  OrderFormInput,
  StatusTransitionInput,
} from "@/lib/schemas/order";
import { revalidatePath, revalidateTag } from "next/cache";
import { getMachineConstraints } from "./lookup-service";
import { DASHBOARD_TAG } from "./cache-tags";

// -----------------------------------------------------------------------------
// STATUS TRANSITION RULES (Single Source of Truth)
// -----------------------------------------------------------------------------

export async function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  role: Role
): Promise<boolean> {
  if (from === to) return false;

  // Cancellation rule: Can cancel from any state before DISPATCHED
  if (to === OrderStatus.CANCELLED) {
    if (from === OrderStatus.DISPATCHED || from === OrderStatus.CANCELLED) {
      return false;
    }
    return role === Role.ADMIN || role === Role.SALES;
  }

  switch (from) {
    case OrderStatus.DRAFT:
      if (to === OrderStatus.CONFIRMED) {
        return role === Role.ADMIN || role === Role.SALES;
      }
      return false;

    case OrderStatus.CONFIRMED:
      if (to === OrderStatus.DRAFT) {
        return role === Role.ADMIN || role === Role.SALES;
      }
      if (to === OrderStatus.PLANNED) {
        return role === Role.ADMIN || role === Role.PLANNER;
      }
      return false;

    case OrderStatus.PLANNED:
      if (to === OrderStatus.CONFIRMED) {
        return role === Role.ADMIN || role === Role.PLANNER;
      }
      if (to === OrderStatus.IN_PRODUCTION) {
        return role === Role.ADMIN || role === Role.PLANNER || role === Role.OPERATOR;
      }
      return false;

    case OrderStatus.IN_PRODUCTION:
      if (to === OrderStatus.PRODUCED) {
        return role === Role.ADMIN || role === Role.PLANNER || role === Role.OPERATOR;
      }
      if (to === OrderStatus.CONFIRMED) {
        return role === Role.ADMIN || role === Role.PLANNER;
      }
      return false;

    case OrderStatus.PRODUCED:
      if (to === OrderStatus.DISPATCHED) {
        return role === Role.ADMIN || role === Role.DISPATCH;
      }
      return false;

    case OrderStatus.DISPATCHED:
    case OrderStatus.CANCELLED:
      return false;

    default:
      return false;
  }
}

export async function getLegalTransitions(from: OrderStatus, role: Role): Promise<OrderStatus[]> {
  const allStatuses = Object.values(OrderStatus);
  const legal: OrderStatus[] = [];
  for (const st of allStatuses) {
    if (await canTransition(from, st, role)) {
      legal.push(st);
    }
  }
  return legal;
}

// -----------------------------------------------------------------------------
// ORDER NUMBER GENERATOR (Monthly Reset: SO-YYMM-0001)
// -----------------------------------------------------------------------------

export async function generateOrderNumber(
  tx: Prisma.TransactionClient,
  date: Date = new Date()
): Promise<string> {
  const d = new Date(date);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const prefix = `SO-${yy}${mm}-`;

  const latestOrder = await tx.order.findFirst({
    where: {
      orderNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      orderNumber: "desc",
    },
    select: {
      orderNumber: true,
    },
  });

  let nextSequence = 1;
  if (latestOrder && latestOrder.orderNumber) {
    const parts = latestOrder.orderNumber.split("-");
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
// LIST & STATS QUERIES
// -----------------------------------------------------------------------------

export interface OrderQueryParams extends QueryParams {
  status?: OrderStatus[];
  priority?: OrderPriority[];
  clientId?: string;
  gsm?: number;
  deliveryFrom?: string;
  deliveryTo?: string;
}

export async function getOrders(params: OrderQueryParams) {
  const { skip, take, search, sortBy, sortOrder } = parsePaginationParams(params);

  const where: Prisma.OrderWhereInput = {
    ...(search
      ? {
          OR: [
            { orderNumber: { contains: search } },
            { client: { name: { contains: search } } },
            { client: { code: { contains: search } } },
            { notes: { contains: search } },
          ],
        }
      : {}),
    ...(params.status && params.status.length > 0
      ? { status: { in: params.status } }
      : {}),
    ...(params.priority && params.priority.length > 0
      ? { priority: { in: params.priority } }
      : {}),
    ...(params.clientId ? { clientId: params.clientId } : {}),
    ...(params.gsm
      ? {
          items: {
            some: { gsm: Number(params.gsm) },
          },
        }
      : {}),
    ...(params.deliveryFrom || params.deliveryTo
      ? {
          deliveryDate: {
            ...(params.deliveryFrom ? { gte: new Date(params.deliveryFrom) } : {}),
            ...(params.deliveryTo ? { lte: new Date(params.deliveryTo) } : {}),
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      skip,
      take,
      orderBy: {
        [sortBy === "createdAt" ? "deliveryDate" : sortBy]: sortOrder,
      },
      include: {
        client: {
          select: { id: true, name: true, code: true, city: true, state: true },
        },
        items: true,
      },
    }),
  ]);

  return buildPaginatedResponse(rows, total, Math.floor(skip / take) + 1, take);
}

export async function getOrderSummaryStats() {
  const now = new Date();
  const weekFromNow = new Date();
  weekFromNow.setDate(now.getDate() + 7);

  const activeStatuses = [
    OrderStatus.DRAFT,
    OrderStatus.CONFIRMED,
    OrderStatus.PLANNED,
    OrderStatus.IN_PRODUCTION,
  ];

  // Two queries instead of four: one pulls every active order's delivery date
  // (open / due-this-week / overdue are all derived from it in JS), the other
  // sums outstanding kg across their line items.
  const [activeOrders, allActiveItems] = await Promise.all([
    db.order.findMany({
      where: { status: { in: activeStatuses } },
      select: { deliveryDate: true },
    }),
    db.orderItem.findMany({
      where: { order: { status: { in: activeStatuses } } },
      select: { quantityKg: true, producedKg: true },
    }),
  ]);

  let dueThisWeekCount = 0;
  let overdueCount = 0;
  for (const o of activeOrders) {
    if (!o.deliveryDate) continue;
    const d = o.deliveryDate;
    if (d < now) overdueCount += 1;
    else if (d <= weekFromNow) dueThisWeekCount += 1;
  }

  let totalPendingKg = 0;
  for (const item of allActiveItems) {
    const qty = Number(item.quantityKg) || 0;
    const prod = Number(item.producedKg) || 0;
    totalPendingKg += Math.max(0, qty - prod);
  }

  return {
    openOrdersCount: activeOrders.length,
    totalPendingKg,
    ordersDueThisWeek: dueThisWeekCount,
    overdueOrdersCount: overdueCount,
  };
}

export async function getOrderById(id: string) {
  // The order graph and its audit timeline are independent queries — run them
  // concurrently instead of sequentially.
  const [order, auditLogs] = await Promise.all([
    db.order.findUnique({
      where: { id },
      include: {
        client: true,
        createdBy: { select: { id: true, name: true, role: true } },
        items: {
          orderBy: { widthInch: "desc" },
          include: {
            patternCuts: {
              include: {
                cuttingPattern: {
                  include: {
                    productionRun: {
                      include: { machine: true },
                    },
                  },
                },
              },
            },
          },
        },
        loadAssignments: {
          include: {
            loadBatch: {
              include: { truck: true, transporter: true },
            },
          },
        },
      },
    }),
    db.auditLog.findMany({
      where: {
        entityType: "Order",
        entityId: id,
      },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, role: true } } },
      take: 50,
    }),
  ]);

  if (!order) return null;

  return {
    ...order,
    auditLogs,
  };
}

export async function getActiveMachineConstraints() {
  // Delegates to the cached machine lookup (invalidated on machine mutations).
  return getMachineConstraints();
}

// -----------------------------------------------------------------------------
// MUTATIONS (Create, Update, Transition, Cancel)
// -----------------------------------------------------------------------------

export async function createOrder(data: OrderFormInput) {
  const { userId } = await requireRole(Role.ADMIN, Role.SALES);
  const validated = orderFormSchema.parse(data);

  // Validate line items against active machines
  const { machines, maxDeckle } = await getActiveMachineConstraints();
  if (machines.length === 0) {
    throw new Error("No active machines configured. Please add a machine before creating orders.");
  }

  for (const item of validated.items) {
    if (item.widthInch > maxDeckle) {
      throw new Error(
        `Width ${item.widthInch}" exceeds the largest active machine deckle of ${maxDeckle}". No machine can cut this reel.`
      );
    }
    const compatibleMachines = machines.filter(
      (m) => item.gsm >= m.minGsm && item.gsm <= m.maxGsm
    );
    if (compatibleMachines.length === 0) {
      throw new Error(
        `GSM ${item.gsm} cannot be run on any active machine. Active GSM ranges: ${machines
          .map((m) => `${m.code} (${m.minGsm}â€“${m.maxGsm})`)
          .join(", ")}.`
      );
    }
  }

  const order = await db.$transaction(async (tx) => {
    const orderNumber = await generateOrderNumber(tx, validated.orderDate);

    const created = await tx.order.create({
      data: {
        orderNumber,
        clientId: validated.clientId,
        orderDate: validated.orderDate,
        deliveryDate: validated.deliveryDate || null,
        priority: validated.priority,
        status: OrderStatus.DRAFT,
        notes: validated.notes?.trim() || null,
        otherNotes: validated.otherNotes?.trim() || null,
        createdById: userId,
        items: {
          create: validated.items.map((item) => ({
            widthInch: new Prisma.Decimal(item.widthInch.toFixed(2)),
            gsm: item.gsm,
            paperType: item.paperType,
            paperColour:
              item.paperType === PaperType.COLOURED
                ? item.paperColour?.trim() || null
                : null,
            remark: item.remark?.trim() || null,
            quantityKg: new Prisma.Decimal(item.quantityKg.toFixed(3)),
            tolerancePercent: new Prisma.Decimal(item.tolerancePercent.toFixed(2)),
            ratePerKg: item.ratePerKg ? new Prisma.Decimal(item.ratePerKg.toFixed(2)) : null,
          })),
        },
      },
      include: {
        items: true,
        client: true,
      },
    });

    await logAudit(
      {
        userId,
        entityType: "Order",
        entityId: created.id,
        action: "CREATE",
        after: {
          orderNumber: created.orderNumber,
          client: created.client.name,
          itemCount: created.items.length,
          status: created.status,
        },
      },
      tx
    );

    return created;
  });

  revalidatePath("/orders");
  revalidateTag(DASHBOARD_TAG);
  return order;
}

export async function updateOrder(id: string, data: OrderFormInput) {
  const { userId } = await requireRole(Role.ADMIN, Role.SALES);
  const validated = orderFormSchema.parse(data);

  const existing = await db.order.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!existing) {
    throw new Error("Order not found.");
  }

  // Domain Rule: An order cannot be edited once it is PLANNED or later
  if (
    existing.status !== OrderStatus.DRAFT &&
    existing.status !== OrderStatus.CONFIRMED
  ) {
    throw new Error(
      `Order #${existing.orderNumber} is in status "${existing.status}" and cannot be edited. It has already been assigned to planning or production. Please cancel and recreate if changes are needed.`
    );
  }

  // Validate items against machine constraints
  const { machines, maxDeckle } = await getActiveMachineConstraints();
  for (const item of validated.items) {
    if (item.widthInch > maxDeckle) {
      throw new Error(
        `Width ${item.widthInch}" exceeds the largest active machine deckle of ${maxDeckle}".`
      );
    }
  }

  const updated = await db.$transaction(async (tx) => {
    // Delete existing items and recreate
    await tx.orderItem.deleteMany({ where: { orderId: id } });

    const res = await tx.order.update({
      where: { id },
      data: {
        clientId: validated.clientId,
        orderDate: validated.orderDate,
        deliveryDate: validated.deliveryDate || null,
        priority: validated.priority,
        notes: validated.notes?.trim() || null,
        otherNotes: validated.otherNotes?.trim() || null,
        items: {
          create: validated.items.map((item) => ({
            widthInch: new Prisma.Decimal(item.widthInch.toFixed(2)),
            gsm: item.gsm,
            paperType: item.paperType,
            paperColour:
              item.paperType === PaperType.COLOURED
                ? item.paperColour?.trim() || null
                : null,
            remark: item.remark?.trim() || null,
            quantityKg: new Prisma.Decimal(item.quantityKg.toFixed(3)),
            tolerancePercent: new Prisma.Decimal(item.tolerancePercent.toFixed(2)),
            ratePerKg: item.ratePerKg ? new Prisma.Decimal(item.ratePerKg.toFixed(2)) : null,
          })),
        },
      },
      include: { items: true, client: true },
    });

    await logAudit(
      {
        userId,
        entityType: "Order",
        entityId: id,
        action: "UPDATE",
        before: { itemCount: existing.items.length, status: existing.status },
        after: { itemCount: res.items.length, status: res.status },
      },
      tx
    );

    return res;
  });

  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
  revalidateTag(DASHBOARD_TAG);
  return updated;
}

export async function transitionOrderStatus(input: StatusTransitionInput) {
  const { userId, role } = await requireRole(
    Role.ADMIN,
    Role.SALES,
    Role.PLANNER,
    Role.OPERATOR,
    Role.DISPATCH
  );
  const validated = statusTransitionSchema.parse(input);

  const existing = await db.order.findUnique({
    where: { id: validated.orderId },
  });

  if (!existing) {
    throw new Error("Order not found.");
  }

  const allowed = await canTransition(existing.status, validated.newStatus, role);
  if (!allowed) {
    throw new Error(
      `Role "${role}" is not authorized to transition order #${existing.orderNumber} from "${existing.status}" to "${validated.newStatus}".`
    );
  }

  const updated = await db.$transaction(async (tx) => {
    const res = await tx.order.update({
      where: { id: validated.orderId },
      data: { status: validated.newStatus },
    });

    await logAudit(
      {
        userId,
        entityType: "Order",
        entityId: validated.orderId,
        action: `STATUS_${validated.newStatus}`,
        before: { status: existing.status },
        after: { status: res.status, reason: validated.reason || null },
      },
      tx
    );

    return res;
  });

  revalidatePath(`/orders/${validated.orderId}`);
  revalidatePath("/orders");
  revalidateTag(DASHBOARD_TAG);
  return updated;
}

export async function cancelOrder(id: string, reason?: string) {
  return transitionOrderStatus({
    orderId: id,
    newStatus: OrderStatus.CANCELLED,
    reason,
  });
}
