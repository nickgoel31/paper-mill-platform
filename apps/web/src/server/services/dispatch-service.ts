"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import {
  Role,
  LoadStatus,
  OrderStatus,
  StockStatus,
  NotificationStatus,
  Prisma,
} from "@/generated/prisma/browser";
import { logAudit } from "./audit-service";
import {
  QueryParams,
  parsePaginationParams,
  buildPaginatedResponse,
} from "./base-service";
import { revalidatePath, revalidateTag } from "next/cache";
import { DASHBOARD_TAG } from "./cache-tags";

// -----------------------------------------------------------------------------
// DISPATCH NUMBER GENERATOR (DSP-YYMM-0001)
// -----------------------------------------------------------------------------

export async function generateDispatchNumber(
  tx: Prisma.TransactionClient,
  date: Date = new Date()
): Promise<string> {
  const d = new Date(date);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const prefix = `DSP-${yy}${mm}-`;

  const latestDispatch = await tx.dispatch.findFirst({
    where: {
      dispatchNumber: { startsWith: prefix },
    },
    orderBy: { dispatchNumber: "desc" },
    select: { dispatchNumber: true },
  });

  let nextSequence = 1;
  if (latestDispatch && latestDispatch.dispatchNumber) {
    const parts = latestDispatch.dispatchNumber.split("-");
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
// QUERY READY TO DISPATCH LOAD BATCHES
// -----------------------------------------------------------------------------

export async function getPendingDispatchLoadBatches() {
  const batches = await db.loadBatch.findMany({
    where: {
      status: { in: [LoadStatus.PLANNED, LoadStatus.LOADING] },
    },
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
    orderBy: { plannedDispatchDate: "asc" },
  });

  return batches.map((b) => {
    // Check readiness of each order item
    let totalItemsCount = 0;
    let fulfilledItemsCount = 0;
    const shortItems: Array<{
      orderNumber: string;
      clientName: string;
      widthInch: number;
      gsm: number;
      shortKg: number;
      requiredKg: number;
      producedKg: number;
    }> = [];

    const distinctClientsMap = new Map<string, { id: string; name: string; city: string; phone: string; whatsapp: string }>();

    b.orders.forEach((lo) => {
      const ord = lo.order;
      distinctClientsMap.set(ord.client.id, {
        id: ord.client.id,
        name: ord.client.name,
        city: ord.client.city,
        phone: ord.client.phone,
        whatsapp: ord.client.whatsappNumber,
      });

      ord.items.forEach((it) => {
        totalItemsCount++;
        const required = Number(it.quantityKg);
        const tol = Number(it.tolerancePercent || 5.0);
        const minReq = required * (1.0 - tol / 100.0);
        const produced = Number(it.producedKg || 0);

        if (produced >= minReq) {
          fulfilledItemsCount++;
        } else {
          shortItems.push({
            orderNumber: ord.orderNumber,
            clientName: ord.client.name,
            widthInch: Number(it.widthInch),
            gsm: it.gsm,
            shortKg: Math.max(0, required - produced),
            requiredKg: required,
            producedKg: produced,
          });
        }
      });
    });

    let readinessStatus: "READY" | "PARTIAL" | "NOT_PRODUCED" = "READY";
    if (fulfilledItemsCount === 0 && totalItemsCount > 0) {
      readinessStatus = "NOT_PRODUCED";
    } else if (fulfilledItemsCount < totalItemsCount) {
      readinessStatus = "PARTIAL";
    }

    return {
      id: b.id,
      batchNumber: b.batchNumber,
      status: b.status,
      plannedDispatchDate: b.plannedDispatchDate,
      totalPlannedKg: Number(b.totalPlannedKg),
      truckNumber: b.truck?.registrationNumber || "Unassigned",
      truckCapacityKg: b.truck ? Number(b.truck.capacityKg) : 25000,
      transporterName: b.transporter?.name || "Direct / Self",
      driverName: b.driverName || "Assigned Driver",
      driverPhone: b.driverPhone || "â€”",
      orderCount: b.orders.length,
      itemCount: totalItemsCount,
      fulfilledCount: fulfilledItemsCount,
      readinessStatus,
      shortItems,
      clients: Array.from(distinctClientsMap.values()),
    };
  });
}

export async function getLoadBatchLoadingSheetData(loadBatchId: string) {
  const batch = await db.loadBatch.findFirst({
    where: { id: loadBatchId },
    include: {
      truck: true,
      transporter: true,
      dispatch: true,
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

  const distinctClients = Array.from(
    new Set(batch.orders.map((o) => o.order.client.id))
  ).map((clientId) => {
    const lo = batch.orders.find((o) => o.order.client.id === clientId)!;
    return lo.order.client;
  });

  return {
    ...batch,
    distinctClients,
  };
}

// -----------------------------------------------------------------------------
// CONFIRM DISPATCH & ATOMIC INVENTORY / WHATSAPP FANOUT
// -----------------------------------------------------------------------------

export interface ConfirmDispatchInput {
  loadBatchId: string;
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
  gatePassNumber?: string;
  dispatchedAt?: string;
  remarks?: string;
  loadedQuantities: Record<string, number>; // orderItemId -> loadedKg
  // Export/logistics document fields.
  consigneeName?: string;
  consigneeAddress?: string;
  voucherNumber?: string;
  termsOfPayment?: string;
  termsOfDelivery?: string;
  dispatchThrough?: string;
  destination?: string;
  vesselFlightNo?: string;
}

export async function confirmDispatch(input: ConfirmDispatchInput) {
  const { userId } = await requireRole(Role.ADMIN, Role.DISPATCH);

  const batch = await db.loadBatch.findFirst({
    where: { id: input.loadBatchId },
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
  });

  if (!batch) throw new Error("Load batch not found.");
  if (batch.status === LoadStatus.DISPATCHED || batch.status === LoadStatus.DELIVERED) {
    throw new Error("This load batch has already been dispatched.");
  }

  const result = await db.$transaction(async (tx) => {
    const dispatchNumber = await generateDispatchNumber(tx);
    const dispatchTime = input.dispatchedAt ? new Date(input.dispatchedAt) : new Date();

    // 1. Calculate total dispatched kg across all loaded items
    let totalLoadedKg = 0;
    const allOrderItems: any[] = [];
    const involvedOrderIds = new Set<string>();
    const clientOrderSummaryMap = new Map<string, { client: any; orders: string[]; totalKg: number }>();

    for (const lo of batch.orders) {
      involvedOrderIds.add(lo.order.id);
      const cId = lo.order.client.id;
      const prevClient = clientOrderSummaryMap.get(cId) || {
        client: lo.order.client,
        orders: [],
        totalKg: 0,
      };
      if (!prevClient.orders.includes(lo.order.orderNumber)) {
        prevClient.orders.push(lo.order.orderNumber);
      }

      for (const it of lo.order.items) {
        allOrderItems.push(it);
        const loaded = input.loadedQuantities[it.id] !== undefined
          ? input.loadedQuantities[it.id]
          : Number(it.quantityKg);

        totalLoadedKg += loaded;
        prevClient.totalKg += loaded;

        // 4. Increment OrderItem.dispatchedKg
        await tx.orderItem.update({
          where: { id: it.id },
          data: {
            dispatchedKg: { increment: new Prisma.Decimal(loaded.toFixed(3)) },
          },
        });

        // 5. Move relevant StockItem rows to status DISPATCHED
        await tx.stockItem.updateMany({
          where: { orderItemId: it.id, status: StockStatus.ALLOCATED },
          data: { status: StockStatus.DISPATCHED },
        });
      }
      clientOrderSummaryMap.set(cId, prevClient);
    }

    // 1. Create Dispatch record
    const dispatchRecord = await tx.dispatch.create({
      data: {
        dispatchNumber,
        loadBatchId: batch.id,
        vehicleNumber: input.vehicleNumber,
        driverName: input.driverName,
        driverPhone: input.driverPhone,
        gatePassNumber: input.gatePassNumber || `GP-${dispatchNumber.replace("DSP-", "")}`,
        dispatchedAt: dispatchTime,
        totalDispatchedKg: new Prisma.Decimal(totalLoadedKg.toFixed(3)),
        remarks: input.remarks || null,
        consigneeName: input.consigneeName || null,
        consigneeAddress: input.consigneeAddress || null,
        voucherNumber: input.voucherNumber || null,
        termsOfPayment: input.termsOfPayment || null,
        termsOfDelivery: input.termsOfDelivery || null,
        dispatchThrough: input.dispatchThrough || null,
        destination: input.destination || null,
        vesselFlightNo: input.vesselFlightNo || null,
        createdById: userId,
      },
    });

    // 2. Set LoadBatch status to DISPATCHED
    await tx.loadBatch.update({
      where: { id: batch.id },
      data: {
        status: LoadStatus.DISPATCHED,
        dispatchedAt: dispatchTime,
        driverName: input.driverName,
        driverPhone: input.driverPhone,
      },
    });

    // 3. Set every Order in the batch to DISPATCHED
    await tx.order.updateMany({
      where: { id: { in: Array.from(involvedOrderIds) } },
      data: { status: OrderStatus.DISPATCHED },
    });

    // 6. Enqueue WhatsAppNotification per DISTINCT CLIENT (Rule E)
    for (const [clientId, info] of clientOrderSummaryMap.entries()) {
      const payloadJson = {
        clientName: info.client.name,
        ordersList: info.orders.join(", "),
        vehicleNumber: input.vehicleNumber,
        driverName: input.driverName,
        driverPhone: input.driverPhone,
        gatePassNumber: dispatchRecord.gatePassNumber,
        dispatchedKg: info.totalKg,
        dispatchedAt: dispatchTime.toISOString(),
      };

      await tx.whatsAppNotification.create({
        data: {
          loadBatchId: batch.id,
          clientId: clientId,
          phoneNumber: info.client.whatsappNumber || info.client.phone,
          templateName: "DISPATCH_TRUCK_DEPARTED",
          payload: payloadJson,
          status: NotificationStatus.QUEUED,
        },
      });
    }

    // 7. Write AuditLog
    await logAudit(
      {
        userId,
        entityType: "Dispatch",
        entityId: dispatchRecord.id,
        action: "CONFIRM_DISPATCH",
        after: {
          dispatchNumber: dispatchRecord.dispatchNumber,
          batchNumber: batch.batchNumber,
          vehicleNumber: input.vehicleNumber,
          totalDispatchedKg: totalLoadedKg,
          clientsNotified: clientOrderSummaryMap.size,
        },
      },
      tx
    );

    return dispatchRecord;
  });

  revalidatePath("/dispatch");
  revalidateTag(DASHBOARD_TAG);
  revalidatePath(`/dispatch/${input.loadBatchId}`);
  revalidatePath("/dispatch/history");
  revalidatePath("/orders");
  revalidatePath("/stock");
  return result;
}

// -----------------------------------------------------------------------------
// DISPATCH HISTORY & DELIVERY CONFIRMATION
// -----------------------------------------------------------------------------

export interface DispatchHistoryQueryParams extends QueryParams {
  clientId?: string;
  transporterId?: string;
  vehicleNumber?: string;
  dateFrom?: string;
  dateTo?: string;
}

function buildDispatchWhere(
  params: DispatchHistoryQueryParams,
  search?: string
): Prisma.DispatchWhereInput {
  return {
    ...(search
      ? {
          OR: [
            { dispatchNumber: { contains: search } },
            { vehicleNumber: { contains: search } },
            { driverName: { contains: search } },
            { gatePassNumber: { contains: search } },
            { loadBatch: { batchNumber: { contains: search } } },
          ],
        }
      : {}),
    ...(params.vehicleNumber
      ? { vehicleNumber: { contains: params.vehicleNumber } }
      : {}),
    ...(params.transporterId
      ? { loadBatch: { transporterId: params.transporterId } }
      : {}),
    ...(params.clientId
      ? { loadBatch: { orders: { some: { order: { clientId: params.clientId } } } } }
      : {}),
    ...(params.dateFrom || params.dateTo
      ? {
          dispatchedAt: {
            ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
            ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
          },
        }
      : {}),
  };
}

const DISPATCH_HISTORY_INCLUDE = {
  loadBatch: {
    include: {
      truck: true,
      transporter: true,
      orders: {
        include: {
          order: {
            include: {
              client: { select: { id: true, name: true, city: true, state: true, phone: true } },
            },
          },
        },
      },
    },
  },
  invoices: {
    select: { id: true, invoiceNumber: true, totalAmount: true, status: true },
  },
  createdBy: { select: { name: true } },
} satisfies Prisma.DispatchInclude;

export async function getDispatchHistory(params: DispatchHistoryQueryParams) {
  const { skip, take, search, sortBy, sortOrder } = parsePaginationParams(params);
  const where = buildDispatchWhere(params, search);

  const [total, rows] = await Promise.all([
    db.dispatch.count({ where }),
    db.dispatch.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy === "createdAt" ? "dispatchedAt" : sortBy]: sortOrder },
      include: DISPATCH_HISTORY_INCLUDE,
    }),
  ]);

  return buildPaginatedResponse(rows, total, Math.floor(skip / take) + 1, take);
}

/** Unpaginated export of dispatch history matching the same filters as `getDispatchHistory`. */
export async function getDispatchHistoryForExport(params: DispatchHistoryQueryParams) {
  const { search } = parsePaginationParams(params);
  const where = buildDispatchWhere(params, search);

  return db.dispatch.findMany({
    where,
    take: 5000,
    orderBy: { dispatchedAt: "desc" },
    include: DISPATCH_HISTORY_INCLUDE,
  });
}

export async function markDispatchDelivered(dispatchId: string) {
  const { userId } = await requireRole(Role.ADMIN, Role.DISPATCH);

  const dispatch = await db.dispatch.findFirst({
    where: { id: dispatchId },
    include: {
      loadBatch: {
        include: {
          orders: {
            include: {
              order: {
                include: { client: true },
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

  const deliveryTime = new Date();

  const updated = await db.$transaction(async (tx) => {
    // 1. Update LoadBatch status to DELIVERED
    const updatedBatch = await tx.loadBatch.update({
      where: { id: dispatch.loadBatchId },
      data: {
        status: LoadStatus.DELIVERED,
        deliveredAt: deliveryTime,
      },
    });

    // 2. Enqueue delivery WhatsApp confirmation for each distinct client
    const distinctClients = Array.from(
      new Set(dispatch.loadBatch!.orders.map((lo) => lo.order.client.id))
    ).map((cId) => dispatch.loadBatch!.orders.find((lo) => lo.order.client.id === cId)!.order.client);

    for (const client of distinctClients) {
      await tx.whatsAppNotification.create({
        data: {
          loadBatchId: dispatch.loadBatchId,
          clientId: client.id,
          phoneNumber: client.whatsappNumber || client.phone,
          templateName: "DELIVERY_CONFIRMATION",
          payload: {
            clientName: client.name,
            vehicleNumber: dispatch.vehicleNumber,
            dispatchNumber: dispatch.dispatchNumber,
            deliveredAt: deliveryTime.toISOString(),
          },
          status: NotificationStatus.QUEUED,
        },
      });
    }

    // 3. Audit Log
    await logAudit(
      {
        userId,
        entityType: "Dispatch",
        entityId: dispatchId,
        action: "MARK_DELIVERED",
        after: {
          deliveredAt: deliveryTime,
          clientsNotified: distinctClients.length,
        },
      },
      tx
    );

    return updatedBatch;
  });

  revalidatePath("/dispatch/history");
  revalidatePath("/dispatch");
  revalidateTag(DASHBOARD_TAG);
  return updated;
}
