"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role, OrderStatus, OrderPriority, Prisma } from "@/generated/prisma/browser";
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
import { toInches } from "@/lib/units";
import { formatWidthInch } from "@/lib/utils";

/** widthInch on the line as typed -> canonical inches, for storage/validation. */
function itemWidthInches(item: { widthInch: number; widthUnit: import("@/generated/prisma/browser").LengthUnit }) {
  return toInches(item.widthInch, item.widthUnit);
}

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
  orderFrom?: string;
  orderTo?: string;
  /** Matches orders with at least one line item whose weight falls in this range. */
  weightMinKg?: number;
  weightMaxKg?: number;
  paperSize?: import("@/generated/prisma/browser").PaperSize;
  paperType?: import("@/generated/prisma/browser").PaperType;
}

/**
 * `YYYY-MM-DD` range -> Prisma date filter. "From" is the start of that day and
 * "to" is the END of that day, so picking the same day twice returns that day.
 */
function dateRange(from?: string, to?: string) {
  const gte = from ? new Date(`${from.slice(0, 10)}T00:00:00.000Z`) : undefined;
  const lte = to ? new Date(`${to.slice(0, 10)}T23:59:59.999Z`) : undefined;
  return {
    ...(gte && !isNaN(gte.getTime()) ? { gte } : {}),
    ...(lte && !isNaN(lte.getTime()) ? { lte } : {}),
  };
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
    ...(params.weightMinKg != null || params.weightMaxKg != null
      ? {
          items: {
            some: {
              quantityKg: {
                ...(params.weightMinKg != null ? { gte: params.weightMinKg } : {}),
                ...(params.weightMaxKg != null ? { lte: params.weightMaxKg } : {}),
              },
            },
          },
        }
      : {}),
    ...(params.paperSize ? { items: { some: { size: params.paperSize } } } : {}),
    ...(params.paperType ? { items: { some: { paperType: params.paperType } } } : {}),
    ...(params.deliveryFrom || params.deliveryTo
      ? { deliveryDate: dateRange(params.deliveryFrom, params.deliveryTo) }
      : {}),
    ...(params.orderFrom || params.orderTo
      ? { orderDate: dateRange(params.orderFrom, params.orderTo) }
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
    db.order.findFirst({
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

export async function getActiveMachineConstraints(tenantId: string) {
  // Delegates to the cached machine lookup (invalidated on machine mutations).
  return getMachineConstraints(tenantId);
}

// -----------------------------------------------------------------------------
// MUTATIONS (Create, Update, Transition, Cancel)
// -----------------------------------------------------------------------------

export async function createOrder(data: OrderFormInput) {
  const { userId, tenantId } = await requireRole(Role.ADMIN, Role.SALES);
  const validated = orderFormSchema.parse(data);

  // Validate line items against active machines
  const { machines, maxDeckle } = await getActiveMachineConstraints(tenantId!);
  if (machines.length === 0) {
    throw new Error("No active machines configured. Please add a machine before creating orders.");
  }

  for (const item of validated.items) {
    const widthIn = itemWidthInches(item);
    if (widthIn > maxDeckle) {
      throw new Error(
        `Width ${formatWidthInch(widthIn, item.widthUnit)} exceeds the largest active machine deckle of ${maxDeckle.toFixed(2)}". No machine can cut this reel.`
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
            widthInch: new Prisma.Decimal(itemWidthInches(item).toFixed(2)),
            enteredWidth: new Prisma.Decimal(item.widthInch.toFixed(2)),
            enteredWidthUnit: item.widthUnit,
            gsm: item.gsm,
            paperType: item.paperType,
            size: item.size,
            numberOfReels:
              item.numberOfReels != null && item.numberOfReels > 0
                ? Math.round(item.numberOfReels)
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

// -----------------------------------------------------------------------------
// CSV IMPORT
// -----------------------------------------------------------------------------

/**
 * Bulk-create sales orders from parsed CSV rows — one row per order line.
 * Rows sharing the same non-blank "orderNumber" are grouped into a single
 * multi-line order; a blank "orderNumber" makes that row its own single-line
 * order with an auto-generated number. A bad group is reported and skipped
 * rather than failing the whole file.
 */
export async function importOrdersCsv(rows: Record<string, string>[]) {
  const { userId, tenantId } = await requireRole(Role.ADMIN, Role.SALES);

  const { machines, maxDeckle } = await getActiveMachineConstraints(tenantId!);
  if (machines.length === 0) {
    throw new Error("No active machines configured. Please add a machine before importing orders.");
  }

  // Group rows by orderNumber (case-insensitive); a blank one is its own group.
  const groups = new Map<string, { rows: Record<string, string>[]; rowNums: number[] }>();
  rows.forEach((r, i) => {
    const rowNum = i + 2;
    const key = r.orderNumber?.trim() ? r.orderNumber.trim().toUpperCase() : `__row_${i}`;
    const g = groups.get(key) || { rows: [], rowNums: [] };
    g.rows.push(r);
    g.rowNums.push(rowNum);
    groups.set(key, g);
  });

  const errors: { row: number; message: string }[] = [];
  let created = 0;

  for (const [key, group] of groups) {
    const rowLabel =
      group.rowNums.length === 1
        ? `${group.rowNums[0]}`
        : `${group.rowNums[0]}-${group.rowNums[group.rowNums.length - 1]}`;

    try {
      const first = group.rows[0];
      const clientCode = first.clientCode?.trim() || "";
      if (!clientCode) throw new Error(`"clientCode" is required.`);

      const client = await db.client.findFirst({ where: { code: clientCode } });
      if (!client) throw new Error(`No client found with code "${clientCode}".`);

      const customOrderNumber = key.startsWith("__row_") ? "" : first.orderNumber.trim();
      if (customOrderNumber) {
        const existing = await db.order.findFirst({ where: { orderNumber: customOrderNumber } });
        if (existing) throw new Error(`Order number "${customOrderNumber}" already exists.`);
      }

      const orderDate = first.orderDate?.trim() ? new Date(first.orderDate.trim()) : new Date();
      if (isNaN(orderDate.getTime())) throw new Error(`Invalid "orderDate": "${first.orderDate}"`);
      const deliveryDate = first.deliveryDate?.trim() ? new Date(first.deliveryDate.trim()) : null;
      if (deliveryDate && isNaN(deliveryDate.getTime())) {
        throw new Error(`Invalid "deliveryDate": "${first.deliveryDate}"`);
      }
      const priorityRaw = (first.priority || "").toUpperCase();
      const priority = (Object.values(OrderPriority) as string[]).includes(priorityRaw)
        ? (priorityRaw as OrderPriority)
        : OrderPriority.NORMAL;

      const items = group.rows.map((r, idx) => {
        const widthRaw = parseFloat(r.widthInch);
        const gsm = parseInt(r.gsm, 10);
        const quantityKg = parseFloat(r.quantityKg);
        if (isNaN(widthRaw) || widthRaw <= 0) {
          throw new Error(`Invalid "widthInch" on line ${idx + 1} of this order: "${r.widthInch}"`);
        }
        if (isNaN(gsm) || gsm <= 0) {
          throw new Error(`Invalid "gsm" on line ${idx + 1} of this order: "${r.gsm}"`);
        }
        if (isNaN(quantityKg) || quantityKg <= 0) {
          throw new Error(`Invalid "quantityKg" on line ${idx + 1} of this order: "${r.quantityKg}"`);
        }
        const widthUnit = (r.widthUnit || "").toUpperCase() === "CM" ? "CM" : "INCH";
        const widthIn = toInches(widthRaw, widthUnit as any);
        if (widthIn > maxDeckle) {
          throw new Error(
            `Width ${formatWidthInch(widthIn, widthUnit as any)} on line ${idx + 1} exceeds the largest active machine deckle of ${maxDeckle.toFixed(2)}".`
          );
        }
        const compatibleMachines = machines.filter((m) => gsm >= m.minGsm && gsm <= m.maxGsm);
        if (compatibleMachines.length === 0) {
          throw new Error(`GSM ${gsm} on line ${idx + 1} cannot be run on any active machine.`);
        }
        const paperType = (r.paperType || "").toUpperCase() === "BY" ? "BY" : "NATURAL";
        const size = (r.size || "").toUpperCase() === "BABY" ? "BABY" : "NORMAL";
        const numberOfReels = r.numberOfReels?.trim() ? parseInt(r.numberOfReels, 10) : null;
        const tolerancePercent = r.tolerancePercent?.trim() ? parseFloat(r.tolerancePercent) : 5.0;
        const ratePerKg = r.ratePerKg?.trim() ? parseFloat(r.ratePerKg) : null;

        return {
          widthInch: new Prisma.Decimal(widthIn.toFixed(2)),
          enteredWidth: new Prisma.Decimal(widthRaw.toFixed(2)),
          enteredWidthUnit: widthUnit as any,
          gsm,
          paperType: paperType as any,
          size: size as any,
          numberOfReels: numberOfReels && numberOfReels > 0 ? numberOfReels : null,
          remark: r.remark?.trim() || null,
          quantityKg: new Prisma.Decimal(quantityKg.toFixed(3)),
          tolerancePercent: new Prisma.Decimal((isNaN(tolerancePercent) ? 5.0 : tolerancePercent).toFixed(2)),
          ratePerKg: ratePerKg && !isNaN(ratePerKg) ? new Prisma.Decimal(ratePerKg.toFixed(2)) : null,
        };
      });

      await db.$transaction(async (tx) => {
        const orderNumber = customOrderNumber || (await generateOrderNumber(tx, orderDate));
        const order = await tx.order.create({
          data: {
            orderNumber,
            clientId: client.id,
            orderDate,
            deliveryDate,
            priority,
            status: OrderStatus.DRAFT,
            notes: first.notes?.trim() || null,
            otherNotes: first.otherNotes?.trim() || null,
            createdById: userId,
            items: { create: items },
          },
        });
        await logAudit(
          { userId, entityType: "Order", entityId: order.id, action: "CREATE", after: { source: "CSV import", orderNumber } },
          tx
        );
      });

      created++;
    } catch (err: any) {
      errors.push({ row: group.rowNums[0], message: `Row(s) ${rowLabel}: ${err.message || "Failed to import"}` });
    }
  }

  if (created > 0) {
    revalidatePath("/orders");
    revalidateTag(DASHBOARD_TAG);
  }
  return { created, errors };
}

export async function updateOrder(id: string, data: OrderFormInput) {
  const { userId, tenantId } = await requireRole(Role.ADMIN, Role.SALES);
  const validated = orderFormSchema.parse(data);

  const existing = await db.order.findFirst({
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
  const { machines, maxDeckle } = await getActiveMachineConstraints(tenantId!);
  for (const item of validated.items) {
    const widthIn = itemWidthInches(item);
    if (widthIn > maxDeckle) {
      throw new Error(
        `Width ${formatWidthInch(widthIn, item.widthUnit)} exceeds the largest active machine deckle of ${maxDeckle.toFixed(2)}".`
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
            widthInch: new Prisma.Decimal(itemWidthInches(item).toFixed(2)),
            enteredWidth: new Prisma.Decimal(item.widthInch.toFixed(2)),
            enteredWidthUnit: item.widthUnit,
            gsm: item.gsm,
            paperType: item.paperType,
            size: item.size,
            numberOfReels:
              item.numberOfReels != null && item.numberOfReels > 0
                ? Math.round(item.numberOfReels)
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

  const existing = await db.order.findFirst({
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
