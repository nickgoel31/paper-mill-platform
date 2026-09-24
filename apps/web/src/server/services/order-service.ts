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
  orderItemSchema,
  statusTransitionSchema,
  OrderFormInput,
  StatusTransitionInput,
} from "@/lib/schemas/order";
import { revalidatePath, revalidateTag } from "next/cache";
import { getMachineConstraints } from "./lookup-service";
import { DASHBOARD_TAG } from "./cache-tags";
import { toInches, fromInches } from "@/lib/units";
import { formatWidthInch } from "@/lib/utils";
import { getGsmWeightMap } from "./gsm-weight-service";

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
  paperType?: string;
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

function buildOrderWhere(params: OrderQueryParams, search?: string): Prisma.OrderWhereInput {
  return {
    ...(search
      ? {
          OR: [
            { orderNumber: { contains: search } },
            { offlineOrderNo: { contains: search } },
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
}

export async function getOrders(params: OrderQueryParams) {
  const { skip, take, search, sortBy, sortOrder } = parsePaginationParams(params);
  const where = buildOrderWhere(params, search);

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

/** Unpaginated export of orders matching the same filters as `getOrders`. */
export async function getOrdersForExport(params: OrderQueryParams) {
  const { search } = parsePaginationParams(params);
  const where = buildOrderWhere(params, search);

  return db.order.findMany({
    where,
    take: 5000,
    orderBy: { orderDate: "desc" },
    include: {
      client: {
        select: { id: true, name: true, code: true, city: true, state: true, phone: true },
      },
      items: true,
    },
  });
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

/**
 * Errors thrown from a Server Action are redacted to a generic message in
 * production. Catching here and returning `{ error }` instead of throwing is
 * what actually gets a readable message back to the toast.
 */
export async function createOrder(data: OrderFormInput) {
  try {
    const { userId, tenantId } = await requireRole(Role.ADMIN, Role.SALES);
    const parsed = orderFormSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues.map((i) => i.message).join(" ") };
    }
    const validated = parsed.data;

    // Validate line items against active machines
    const { machines, maxDeckle } = await getActiveMachineConstraints(tenantId!);
    if (machines.length === 0) {
      return { error: "No active machines configured. Please add a machine before creating orders." };
    }

    for (const item of validated.items) {
      // Booking-only lines have no real width/GSM yet — nothing to validate
      // against a machine until they're edited with real dimensions.
      if (item.isBookingOnly) continue;
      const widthIn = itemWidthInches(item);
      if (widthIn > maxDeckle) {
        return {
          error: `Width ${formatWidthInch(widthIn, item.widthUnit)} exceeds the largest active machine deckle of ${maxDeckle.toFixed(2)}". No machine can cut this reel.`,
        };
      }
      const compatibleMachines = machines.filter(
        (m) => item.gsm >= m.minGsm && item.gsm <= m.maxGsm
      );
      if (compatibleMachines.length === 0) {
        return {
          error: `GSM ${item.gsm} cannot be run on any active machine. Active GSM ranges: ${machines
            .map((m) => `${m.code} (${m.minGsm}–${m.maxGsm})`)
            .join(", ")}.`,
        };
      }
    }

    const customOrderNumber = validated.orderNumber?.trim() || "";
    if (customOrderNumber) {
      const dup = await db.order.findFirst({ where: { orderNumber: customOrderNumber } });
      if (dup) return { error: `Order number "${customOrderNumber}" is already in use.` };
    }

    const order = await db.$transaction(async (tx) => {
    const orderNumber = customOrderNumber || (await generateOrderNumber(tx, validated.orderDate));

    const created = await tx.order.create({
      data: {
        orderNumber,
        offlineOrderNo: validated.offlineOrderNo?.trim() || null,
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
            widthInch: new Prisma.Decimal(item.isBookingOnly ? 0 : itemWidthInches(item).toFixed(2)),
            enteredWidth: new Prisma.Decimal(item.isBookingOnly ? 0 : item.widthInch.toFixed(2)),
            enteredWidthUnit: item.widthUnit,
            gsm: item.isBookingOnly ? 0 : item.gsm,
            isBookingOnly: item.isBookingOnly,
            paperType: item.paperType,
            size: item.size,
            bf: item.bf,
            numberOfReels:
              item.numberOfReels != null && item.numberOfReels > 0
                ? Math.round(item.numberOfReels)
                : null,
            remark: item.remark?.trim() || null,
            quantityKg: new Prisma.Decimal(item.quantityKg.toFixed(3)),
            tolerancePercent: new Prisma.Decimal(item.tolerancePercent.toFixed(2)),
            ratePerKg: item.ratePerKg ? new Prisma.Decimal(item.ratePerKg.toFixed(2)) : null,
            kgPerInchOverride: item.kgPerInchOverride ? new Prisma.Decimal(item.kgPerInchOverride.toFixed(3)) : null,
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
    return { order };
  } catch (err: any) {
    return { error: err?.message || "Failed to create sales order." };
  }
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
  const gsmWeightMap = await getGsmWeightMap();
  if (machines.length === 0) {
    return {
      created: 0,
      errors: [{ row: 0, message: "No active machines configured. Please add a machine before importing orders." }],
    };
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

  // Batch-prefetch everything the per-group loop used to fetch one at a time
  // (client lookup, duplicate-order-number check, next order-number sequence)
  // — this, plus inserting with createMany instead of one create() per order,
  // is what actually batches the import instead of one round-trip per order.
  const groupList = Array.from(groups.entries());

  const clientCodes = Array.from(
    new Set(groupList.map(([, g]) => g.rows[0].clientCode?.trim()).filter((v): v is string => !!v))
  );
  const clientByCode = new Map(
    clientCodes.length
      ? (await db.client.findMany({ where: { code: { in: clientCodes } } })).map((c) => [c.code, c] as const)
      : []
  );

  const customOrderNumbers = Array.from(
    new Set(
      groupList
        .filter(([key]) => !key.startsWith("__row_"))
        .map(([, g]) => g.rows[0].orderNumber.trim())
    )
  );
  const existingOrderNumbers = new Set(
    customOrderNumbers.length
      ? (
          await db.order.findMany({
            where: { orderNumber: { in: customOrderNumbers } },
            select: { orderNumber: true },
          })
        ).map((o) => o.orderNumber)
      : []
  );
  // Guards against two rows in the same file claiming the same custom number.
  const claimedOrderNumbers = new Set<string>();

  // Auto-numbered orders share the "SO-YYMM-" prefix for whichever month(s)
  // their orderDate falls in — fetch each distinct month's starting sequence
  // once, then increment in-memory per row instead of one query per order.
  const monthPrefix = (d: Date) => `SO-${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, "0")}-`;
  const neededPrefixes = new Set<string>();
  for (const [key, g] of groupList) {
    if (key.startsWith("__row_") || !g.rows[0].orderNumber?.trim()) {
      const d = g.rows[0].orderDate?.trim() ? new Date(g.rows[0].orderDate.trim()) : new Date();
      if (!isNaN(d.getTime())) neededPrefixes.add(monthPrefix(d));
    }
  }
  const nextSeqByPrefix = new Map<string, number>();
  await Promise.all(
    Array.from(neededPrefixes).map(async (prefix) => {
      const latest = await db.order.findFirst({
        where: { orderNumber: { startsWith: prefix } },
        orderBy: { orderNumber: "desc" },
        select: { orderNumber: true },
      });
      const lastSeqStr = latest?.orderNumber?.split("-").pop();
      const parsed = lastSeqStr ? parseInt(lastSeqStr, 10) : NaN;
      nextSeqByPrefix.set(prefix, !isNaN(parsed) ? parsed + 1 : 1);
    })
  );
  const nextAutoOrderNumber = (d: Date) => {
    const prefix = monthPrefix(d);
    const seq = nextSeqByPrefix.get(prefix) ?? 1;
    nextSeqByPrefix.set(prefix, seq + 1);
    return `${prefix}${String(seq).padStart(4, "0")}`;
  };

  const errors: { row: number; message: string }[] = [];
  interface ValidGroup {
    rowNums: number[];
    orderRow: Record<string, unknown>;
    itemRows: Record<string, unknown>[];
  }
  const validGroups: ValidGroup[] = [];

  for (const [key, group] of groupList) {
    const rowLabel =
      group.rowNums.length === 1
        ? `${group.rowNums[0]}`
        : `${group.rowNums[0]}-${group.rowNums[group.rowNums.length - 1]}`;

    try {
      const first = group.rows[0];
      const clientCode = first.clientCode?.trim() || "";
      if (!clientCode) throw new Error(`"clientCode" is required.`);

      const client = clientByCode.get(clientCode);
      if (!client) throw new Error(`No client found with code "${clientCode}".`);

      const customOrderNumber = key.startsWith("__row_") ? "" : first.orderNumber.trim();
      if (customOrderNumber) {
        if (existingOrderNumbers.has(customOrderNumber) || claimedOrderNumbers.has(customOrderNumber)) {
          throw new Error(`Order number "${customOrderNumber}" already exists.`);
        }
        claimedOrderNumbers.add(customOrderNumber);
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
        const isBookingOnly = ["true", "1", "yes"].includes((r.bookingOnly || "").trim().toLowerCase());
        const widthUnit = (r.widthUnit || "").toUpperCase() === "CM" ? "CM" : "INCH";

        // A booking-only line has no size/GSM yet — just weight against a
        // client's offline reference. Skip every dimension/machine check.
        if (isBookingOnly) {
          const quantityKg = r.quantityKg?.trim() ? parseFloat(r.quantityKg) : NaN;
          if (isNaN(quantityKg) || quantityKg <= 0) {
            throw new Error(`Invalid "quantityKg" on line ${idx + 1} of this order: "${r.quantityKg}"`);
          }
          const ratePerKg = r.ratePerKg?.trim() ? parseFloat(r.ratePerKg) : null;
          return {
            widthInch: new Prisma.Decimal(0),
            enteredWidth: new Prisma.Decimal(0),
            enteredWidthUnit: widthUnit as any,
            gsm: 0,
            isBookingOnly: true,
            paperType: "NATURAL" as any,
            size: "NORMAL" as any,
            bf: 18,
            numberOfReels: null,
            remark: r.remark?.trim() || null,
            quantityKg: new Prisma.Decimal(quantityKg.toFixed(3)),
            tolerancePercent: new Prisma.Decimal(5.0),
            ratePerKg: ratePerKg && !isNaN(ratePerKg) ? new Prisma.Decimal(ratePerKg.toFixed(2)) : null,
            kgPerInchOverride: null,
          };
        }

        const gsm = parseInt(r.gsm, 10);
        if (isNaN(gsm) || gsm <= 0) {
          throw new Error(`Invalid "gsm" on line ${idx + 1} of this order: "${r.gsm}"`);
        }
        const numberOfReelsForCalc =
          r.numberOfReels?.trim() && parseInt(r.numberOfReels, 10) > 0 ? parseInt(r.numberOfReels, 10) : 1;
        const kgPerInch = gsmWeightMap[gsm];

        let widthRaw = r.widthInch?.trim() ? parseFloat(r.widthInch) : NaN;
        let quantityKg = r.quantityKg?.trim() ? parseFloat(r.quantityKg) : NaN;

        // If exactly one of width/weight is missing, derive it from the GSM
        // Weight Chart (kg per inch of width) instead of requiring both.
        if ((isNaN(widthRaw) || widthRaw <= 0) && !isNaN(quantityKg) && quantityKg > 0) {
          if (!kgPerInch) {
            throw new Error(
              `Line ${idx + 1}: "widthInch" is missing and no GSM Weight Chart entry exists for ${gsm} GSM to derive it.`
            );
          }
          const widthInches = quantityKg / (kgPerInch * numberOfReelsForCalc);
          widthRaw = fromInches(widthInches, widthUnit as any);
        } else if ((isNaN(quantityKg) || quantityKg <= 0) && !isNaN(widthRaw) && widthRaw > 0) {
          if (!kgPerInch) {
            throw new Error(
              `Line ${idx + 1}: "quantityKg" is missing and no GSM Weight Chart entry exists for ${gsm} GSM to derive it.`
            );
          }
          const widthInches = toInches(widthRaw, widthUnit as any);
          quantityKg = Number((kgPerInch * widthInches * numberOfReelsForCalc).toFixed(3));
        }

        if (isNaN(widthRaw) || widthRaw <= 0) {
          throw new Error(`Invalid "widthInch" on line ${idx + 1} of this order: "${r.widthInch}"`);
        }
        if (isNaN(quantityKg) || quantityKg <= 0) {
          throw new Error(`Invalid "quantityKg" on line ${idx + 1} of this order: "${r.quantityKg}"`);
        }
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
        const paperType = r.paperType?.trim() ? r.paperType.trim().toUpperCase() : "NATURAL";
        const size = (r.size || "").toUpperCase() === "BABY" ? "BABY" : "NORMAL";
        const bfRaw = r.bf?.trim() ? parseInt(r.bf, 10) : 18;
        const bf = !isNaN(bfRaw) && bfRaw > 0 ? bfRaw : 18;
        const numberOfReels = r.numberOfReels?.trim() ? parseInt(r.numberOfReels, 10) : null;
        const tolerancePercent = r.tolerancePercent?.trim() ? parseFloat(r.tolerancePercent) : 5.0;
        const ratePerKg = r.ratePerKg?.trim() ? parseFloat(r.ratePerKg) : null;
        const kgPerInchOverride = r.kgPerInchOverride?.trim() ? parseFloat(r.kgPerInchOverride) : null;

        return {
          widthInch: new Prisma.Decimal(widthIn.toFixed(2)),
          enteredWidth: new Prisma.Decimal(widthRaw.toFixed(2)),
          enteredWidthUnit: widthUnit as any,
          gsm,
          isBookingOnly: false,
          paperType: paperType as any,
          size: size as any,
          bf,
          numberOfReels: numberOfReels && numberOfReels > 0 ? numberOfReels : null,
          remark: r.remark?.trim() || null,
          quantityKg: new Prisma.Decimal(quantityKg.toFixed(3)),
          tolerancePercent: new Prisma.Decimal((isNaN(tolerancePercent) ? 5.0 : tolerancePercent).toFixed(2)),
          ratePerKg: ratePerKg && !isNaN(ratePerKg) ? new Prisma.Decimal(ratePerKg.toFixed(2)) : null,
          kgPerInchOverride:
            kgPerInchOverride && !isNaN(kgPerInchOverride) && kgPerInchOverride > 0
              ? new Prisma.Decimal(kgPerInchOverride.toFixed(3))
              : null,
        };
      });

      const orderNumber = customOrderNumber || nextAutoOrderNumber(orderDate);
      const orderId = crypto.randomUUID();

      validGroups.push({
        rowNums: group.rowNums,
        orderRow: {
          id: orderId,
          orderNumber,
          offlineOrderNo: first.offlineOrderNo?.trim() || null,
          clientId: client.id,
          orderDate,
          deliveryDate,
          priority,
          status: OrderStatus.DRAFT,
          notes: first.notes?.trim() || null,
          otherNotes: first.otherNotes?.trim() || null,
          createdById: userId,
        },
        itemRows: items.map((it) => ({ id: crypto.randomUUID(), orderId, ...it })),
      });
    } catch (err: any) {
      errors.push({ row: group.rowNums[0], message: `Row(s) ${rowLabel}: ${err.message || "Failed to import"}` });
    }
  }

  // Insert in chunks of orders (with their items) instead of one order at a
  // time — each chunk is 2 round-trips total (one createMany for orders, one
  // for their items) no matter how many orders it contains.
  let created = 0;
  const CHUNK_SIZE = 50;
  for (let c = 0; c < validGroups.length; c += CHUNK_SIZE) {
    const chunk = validGroups.slice(c, c + CHUNK_SIZE);
    try {
      await db.order.createMany({ data: chunk.map((g) => g.orderRow as any) });
      await db.orderItem.createMany({ data: chunk.flatMap((g) => g.itemRows as any) });
      created += chunk.length;
    } catch (err: any) {
      for (const g of chunk) {
        const rowLabel =
          g.rowNums.length === 1 ? `${g.rowNums[0]}` : `${g.rowNums[0]}-${g.rowNums[g.rowNums.length - 1]}`;
        errors.push({ row: g.rowNums[0], message: `Row(s) ${rowLabel}: ${err.message || "Failed to import this batch"}` });
      }
    }
  }

  if (created > 0) {
    await logAudit({
      userId,
      entityType: "Order",
      entityId: "bulk-import",
      action: "CREATE",
      after: { source: "CSV import", count: created },
    });
    revalidatePath("/orders");
    revalidateTag(DASHBOARD_TAG);
  }
  return { created, errors };
}

/**
 * Errors thrown from a Server Action are redacted to a generic message in
 * production. Catching here and returning `{ error }` instead of throwing is
 * what actually gets a readable message back to the toast.
 */
export async function updateOrder(id: string, data: OrderFormInput) {
  try {
    const { userId, tenantId } = await requireRole(Role.ADMIN, Role.SALES);
    const parsed = orderFormSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues.map((i) => i.message).join(" ") };
    }
    const validated = parsed.data;

    const existing = await db.order.findFirst({
      where: { id },
      include: { items: true },
    });

    if (!existing) {
      return { error: "Order not found." };
    }

    // Domain Rule: An order cannot be edited once it is PLANNED or later
    if (
      existing.status !== OrderStatus.DRAFT &&
      existing.status !== OrderStatus.CONFIRMED
    ) {
      return {
        error: `Order #${existing.orderNumber} is in status "${existing.status}" and cannot be edited. It has already been assigned to planning or production. Please cancel and recreate if changes are needed.`,
      };
    }

    // Validate items against machine constraints
    const { machines, maxDeckle } = await getActiveMachineConstraints(tenantId!);
    for (const item of validated.items) {
      if (item.isBookingOnly) continue;
      const widthIn = itemWidthInches(item);
      if (widthIn > maxDeckle) {
        return {
          error: `Width ${formatWidthInch(widthIn, item.widthUnit)} exceeds the largest active machine deckle of ${maxDeckle.toFixed(2)}".`,
        };
      }
    }

    const newOrderNumber = validated.orderNumber?.trim() || existing.orderNumber;
    if (newOrderNumber !== existing.orderNumber) {
      const dup = await db.order.findFirst({ where: { orderNumber: newOrderNumber } });
      if (dup && dup.id !== id) return { error: `Order number "${newOrderNumber}" is already in use.` };
    }

    const updated = await db.$transaction(async (tx) => {
    // Delete existing items and recreate
    await tx.orderItem.deleteMany({ where: { orderId: id } });

    const res = await tx.order.update({
      where: { id },
      data: {
        orderNumber: newOrderNumber,
        offlineOrderNo: validated.offlineOrderNo?.trim() || null,
        clientId: validated.clientId,
        orderDate: validated.orderDate,
        deliveryDate: validated.deliveryDate || null,
        priority: validated.priority,
        notes: validated.notes?.trim() || null,
        otherNotes: validated.otherNotes?.trim() || null,
        items: {
          create: validated.items.map((item) => ({
            widthInch: new Prisma.Decimal(item.isBookingOnly ? 0 : itemWidthInches(item).toFixed(2)),
            enteredWidth: new Prisma.Decimal(item.isBookingOnly ? 0 : item.widthInch.toFixed(2)),
            enteredWidthUnit: item.widthUnit,
            gsm: item.isBookingOnly ? 0 : item.gsm,
            isBookingOnly: item.isBookingOnly,
            paperType: item.paperType,
            size: item.size,
            bf: item.bf,
            numberOfReels:
              item.numberOfReels != null && item.numberOfReels > 0
                ? Math.round(item.numberOfReels)
                : null,
            remark: item.remark?.trim() || null,
            quantityKg: new Prisma.Decimal(item.quantityKg.toFixed(3)),
            tolerancePercent: new Prisma.Decimal(item.tolerancePercent.toFixed(2)),
            ratePerKg: item.ratePerKg ? new Prisma.Decimal(item.ratePerKg.toFixed(2)) : null,
            kgPerInchOverride: item.kgPerInchOverride ? new Prisma.Decimal(item.kgPerInchOverride.toFixed(3)) : null,
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
    return { order: updated };
  } catch (err: any) {
    return { error: err?.message || "Failed to update sales order." };
  }
}

// -----------------------------------------------------------------------------
// ADD A SINGLE LINE ITEM (mid-order addition, any status short of dispatched)
// -----------------------------------------------------------------------------

/**
 * Appends one new line item to an existing order without touching any
 * existing line — unlike `updateOrder`, which replaces the whole item set and
 * is only allowed while the order is still DRAFT/CONFIRMED. This lets sales
 * add a size the client asked for after the order's already been planned or
 * put into production, without disturbing patternCuts/stockItems already
 * linked to the other lines. The new line is picked up automatically by
 * deckle planning and stock-matching on their next (always-live) query.
 */
export async function addOrderItem(orderId: string, item: import("@/lib/schemas/order").OrderItemInput) {
  try {
    const { userId, tenantId } = await requireRole(Role.ADMIN, Role.SALES);
    const parsed = orderItemSchema.safeParse(item);
    if (!parsed.success) {
      return { error: parsed.error.issues.map((i) => i.message).join(" ") };
    }
    const validated = parsed.data;

    const order = await db.order.findFirst({ where: { id: orderId } });
    if (!order) return { error: "Order not found." };
    if (order.status === OrderStatus.DISPATCHED || order.status === OrderStatus.CANCELLED) {
      return { error: `Order #${order.orderNumber} is ${order.status} and can no longer take new line items.` };
    }

    if (!validated.isBookingOnly) {
      const { machines, maxDeckle } = await getActiveMachineConstraints(tenantId!);
      const widthIn = itemWidthInches(validated);
      if (widthIn > maxDeckle) {
        return {
          error: `Width ${formatWidthInch(widthIn, validated.widthUnit)} exceeds the largest active machine deckle of ${maxDeckle.toFixed(2)}".`,
        };
      }
      const compatibleMachines = machines.filter((m) => validated.gsm >= m.minGsm && validated.gsm <= m.maxGsm);
      if (compatibleMachines.length === 0) {
        return { error: `GSM ${validated.gsm} cannot be run on any active machine.` };
      }
    }

    const created = await db.$transaction(async (tx) => {
      const row = await tx.orderItem.create({
        data: {
          orderId,
          widthInch: new Prisma.Decimal(validated.isBookingOnly ? 0 : itemWidthInches(validated).toFixed(2)),
          enteredWidth: new Prisma.Decimal(validated.isBookingOnly ? 0 : validated.widthInch.toFixed(2)),
          enteredWidthUnit: validated.widthUnit,
          gsm: validated.isBookingOnly ? 0 : validated.gsm,
          isBookingOnly: validated.isBookingOnly,
          paperType: validated.paperType,
          size: validated.size,
          bf: validated.bf,
          numberOfReels:
            validated.numberOfReels != null && validated.numberOfReels > 0
              ? Math.round(validated.numberOfReels)
              : null,
          remark: validated.remark?.trim() || null,
          quantityKg: new Prisma.Decimal(validated.quantityKg.toFixed(3)),
          tolerancePercent: new Prisma.Decimal(validated.tolerancePercent.toFixed(2)),
          ratePerKg: validated.ratePerKg ? new Prisma.Decimal(validated.ratePerKg.toFixed(2)) : null,
          kgPerInchOverride: validated.kgPerInchOverride
            ? new Prisma.Decimal(validated.kgPerInchOverride.toFixed(3))
            : null,
        },
      });

      await logAudit(
        {
          userId,
          entityType: "Order",
          entityId: orderId,
          action: "ADD_ITEM",
          after: { orderNumber: order.orderNumber, itemId: row.id, gsm: row.gsm, quantityKg: Number(row.quantityKg) },
        },
        tx
      );

      return row;
    });

    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/orders");
    revalidatePath("/deckle");
    revalidateTag(DASHBOARD_TAG);
    return { item: created };
  } catch (err: any) {
    return { error: err?.message || "Failed to add line item." };
  }
}

/**
 * Errors thrown from a Server Action are redacted to a generic message in
 * production. Catching here and returning `{ error }` instead of throwing is
 * what actually gets a readable message back to the toast.
 */
export async function transitionOrderStatus(input: StatusTransitionInput) {
  try {
    const { userId, role } = await requireRole(
      Role.ADMIN,
      Role.SALES,
      Role.PLANNER,
      Role.OPERATOR,
      Role.DISPATCH
    );
    const parsed = statusTransitionSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues.map((i) => i.message).join(" ") };
    }
    const validated = parsed.data;

    const existing = await db.order.findFirst({
      where: { id: validated.orderId },
    });

    if (!existing) {
      return { error: "Order not found." };
    }

    const allowed = await canTransition(existing.status, validated.newStatus, role);
    if (!allowed) {
      return {
        error: `Role "${role}" is not authorized to transition order #${existing.orderNumber} from "${existing.status}" to "${validated.newStatus}".`,
      };
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
    return { order: updated };
  } catch (err: any) {
    return { error: err?.message || "Failed to transition order status." };
  }
}

export async function cancelOrder(id: string, reason?: string) {
  return transitionOrderStatus({
    orderId: id,
    newStatus: OrderStatus.CANCELLED,
    reason,
  });
}

// -----------------------------------------------------------------------------
// DELETE (ADMIN ONLY) — only orders nothing has been produced/dispatched
// against yet; anything past that must be cancelled instead, never deleted.
// -----------------------------------------------------------------------------

function isOrderDeletable(order: { items: { producedKg: any; dispatchedKg: any }[] }): boolean {
  return !order.items.some((it) => Number(it.producedKg || 0) > 0 || Number(it.dispatchedKg || 0) > 0);
}

function friendlyDeleteError(err: unknown, label: string): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (/foreign key/i.test(msg)) {
    return new Error(`Can't delete this ${label} — other records still reference it (e.g. a dispatch, invoice, or production run).`);
  }
  return err instanceof Error ? err : new Error(msg);
}

export async function deleteOrder(id: string) {
  const { userId } = await requireRole(Role.ADMIN);

  const order = await db.order.findFirst({ where: { id }, include: { items: true } });
  if (!order) throw new Error("Order not found.");
  if (!isOrderDeletable(order)) {
    throw new Error(
      `Order ${order.orderNumber} has production or dispatch recorded against it and can't be deleted — cancel it instead.`
    );
  }

  try {
    await db.order.delete({ where: { id } });
  } catch (err) {
    throw friendlyDeleteError(err, "order");
  }
  await logAudit({
    userId,
    entityType: "Order",
    entityId: id,
    action: "DELETE",
    before: { orderNumber: order.orderNumber, status: order.status },
  });

  revalidatePath("/orders");
  revalidateTag(DASHBOARD_TAG);
}

export async function deleteOrders(ids: string[]) {
  const { userId } = await requireRole(Role.ADMIN);
  if (!ids || ids.length === 0) throw new Error("No orders selected.");

  const orders = await db.order.findMany({ where: { id: { in: ids } }, include: { items: true } });
  const deletable = orders.filter(isOrderDeletable);
  const blocked = orders.filter((o) => !isOrderDeletable(o));

  let deletedCount = 0;
  const failed: { id: string; label: string; reason: string }[] = [];

  if (deletable.length > 0) {
    try {
      await db.order.deleteMany({ where: { id: { in: deletable.map((o) => o.id) } } });
      deletedCount = deletable.length;
      await logAudit({
        userId,
        entityType: "Order",
        entityId: "bulk-delete",
        action: "DELETE",
        before: { count: deletable.length, orderNumbers: deletable.map((o) => o.orderNumber) },
      });
    } catch (err) {
      // deleteMany is all-or-nothing on a constraint failure — fall back to
      // one-by-one so a single blocked order doesn't stop the rest.
      for (const o of deletable) {
        try {
          await db.order.delete({ where: { id: o.id } });
          deletedCount++;
        } catch (rowErr) {
          failed.push({ id: o.id, label: o.orderNumber, reason: friendlyDeleteError(rowErr, "order").message });
        }
      }
      if (deletedCount > 0) {
        await logAudit({
          userId,
          entityType: "Order",
          entityId: "bulk-delete",
          action: "DELETE",
          before: { count: deletedCount },
        });
      }
    }
  }

  revalidatePath("/orders");
  revalidateTag(DASHBOARD_TAG);
  return {
    deleted: deletedCount,
    skipped: [
      ...blocked.map((o) => ({
        id: o.id,
        label: o.orderNumber,
        reason: "Has production or dispatch recorded — cancel it instead.",
      })),
      ...failed,
    ],
  };
}
