"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role, RunStatus, OrderStatus, StockStatus, Prisma } from "@/generated/prisma/browser";
import { logAudit } from "./audit-service";
import {
  QueryParams,
  parsePaginationParams,
  buildPaginatedResponse,
} from "./base-service";
import { revalidatePath, revalidateTag } from "next/cache";
import { DASHBOARD_TAG } from "./cache-tags";
import { generateReelNumber } from "./stock-service";
import { getSystemSettings } from "./settings-service";

// -----------------------------------------------------------------------------
// QUERY RUNS & KPIS
// -----------------------------------------------------------------------------

export interface ProductionQueryParams extends QueryParams {
  machineId?: string;
  status?: RunStatus;
  gsm?: number;
  dateFrom?: string;
  dateTo?: string;
}

export async function getProductionRuns(params: ProductionQueryParams) {
  const { skip, take, search, sortBy, sortOrder } = parsePaginationParams(params);

  const where: Prisma.ProductionRunWhereInput = {
    ...(search
      ? {
          OR: [
            { runNumber: { contains: search } },
            { machine: { name: { contains: search } } },
            { machine: { code: { contains: search } } },
          ],
        }
      : {}),
    ...(params.machineId ? { machineId: params.machineId } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.gsm ? { gsm: Number(params.gsm) } : {}),
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
    db.productionRun.count({ where }),
    db.productionRun.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy === "createdAt" ? "createdAt" : sortBy]: sortOrder },
      include: {
        machine: true,
        patterns: {
          include: { cuts: true },
        },
      },
    }),
  ]);

  return buildPaginatedResponse(rows, total, Math.floor(skip / take) + 1, take);
}

export async function getProductionSummaryStats() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const [runsTodayCount, runningCount, weekRuns, totalKgWeekRes] = await Promise.all([
    db.productionRun.count({
      where: { createdAt: { gte: startOfDay } },
    }),
    db.productionRun.count({
      where: { status: RunStatus.RUNNING },
    }),
    db.productionRun.findMany({
      where: {
        createdAt: { gte: startOfWeek },
        status: { in: [RunStatus.COMPLETED, RunStatus.RUNNING] },
      },
      select: {
        totalTrimPercent: true,
        totalActualKg: true,
        totalPlannedKg: true,
      },
    }),
    db.productionRun.aggregate({
      where: {
        createdAt: { gte: startOfWeek },
        status: RunStatus.COMPLETED,
      },
      _sum: { totalActualKg: true },
    }),
  ]);

  let avgTrimWeek = 0;
  if (weekRuns.length > 0) {
    const sumTrim = weekRuns.reduce(
      (acc, r) => acc + Number(r.totalTrimPercent || 0),
      0
    );
    avgTrimWeek = sumTrim / weekRuns.length;
  }

  const totalKgWeek = Number(totalKgWeekRes._sum.totalActualKg || 0);

  return {
    runsToday: runsTodayCount,
    runningNow: runningCount,
    avgTrimWeek: Number(avgTrimWeek.toFixed(2)),
    totalKgProducedWeek: totalKgWeek,
  };
}

export async function getProductionRunById(id: string) {
  const run = await db.productionRun.findFirst({
    where: { id },
    include: {
      machine: true,
      createdBy: { select: { id: true, name: true, role: true } },
      patterns: {
        orderBy: { sequence: "asc" },
        include: {
          cuts: {
            include: {
              stockPreset: true,
            },
          },
        },
      },
      wastageLogs: true,
      stockItems: true,
    },
  });

  if (!run) return null;

  // Retrieve item details and orders served by this run (filter out nulls from stock presets)
  const orderItemIds = Array.from(
    new Set(
      run.patterns
        .flatMap((p) => p.cuts.map((c) => c.orderItemId))
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  );

  const orderItems =
    orderItemIds.length > 0
      ? await db.orderItem.findMany({
          where: { id: { in: orderItemIds } },
          include: {
            order: {
              include: { client: true },
            },
          },
        })
      : [];

  const auditLogs = await db.auditLog.findMany({
    where: {
      entityType: "ProductionRun",
      entityId: id,
    },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, role: true } } },
    take: 50,
  });

  return {
    ...run,
    orderItems,
    auditLogs,
  };
}

export async function getOperatorMachineQueue(machineId: string) {
  const [runningRun, releasedRuns] = await Promise.all([
    db.productionRun.findFirst({
      where: {
        machineId,
        status: RunStatus.RUNNING,
      },
      include: {
        machine: true,
        patterns: {
          orderBy: { sequence: "asc" },
          include: { cuts: true },
        },
      },
    }),
    db.productionRun.findMany({
      where: {
        machineId,
        status: RunStatus.RELEASED,
      },
      orderBy: { createdAt: "asc" },
      include: {
        machine: true,
        patterns: {
          orderBy: { sequence: "asc" },
          include: { cuts: true },
        },
      },
    }),
  ]);

  return {
    runningRun,
    releasedRuns,
  };
}

// -----------------------------------------------------------------------------
// STATE TRANSITIONS & EXECUTION MUTATIONS
// -----------------------------------------------------------------------------

export async function releaseRunToFloor(id: string) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);

  const existing = await db.productionRun.findFirst({
    where: { id },
  });

  if (!existing) {
    throw new Error("Production run not found.");
  }

  if (existing.status !== RunStatus.PLANNED) {
    throw new Error(`Only PLANNED runs can be released to the floor. Current status: ${existing.status}`);
  }

  const updated = await db.$transaction(async (tx) => {
    const res = await tx.productionRun.update({
      where: { id },
      data: { status: RunStatus.RELEASED },
      include: { machine: true },
    });

    await logAudit(
      {
        userId,
        entityType: "ProductionRun",
        entityId: id,
        action: "RELEASE_TO_FLOOR",
        before: { status: existing.status },
        after: { status: res.status },
      },
      tx
    );

    return res;
  });

  revalidatePath(`/production/${id}`);
  revalidatePath("/production");
  revalidateTag(DASHBOARD_TAG);
  revalidatePath("/operator");
  return updated;
}

export async function startProductionRun(id: string, actionId?: string) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER, Role.OPERATOR);

  const existing = await db.productionRun.findFirst({
    where: { id },
    include: { machine: true },
  });

  if (!existing) {
    throw new Error("Production run not found.");
  }

  // Check if another run is already RUNNING on this machine
  const otherRunning = await db.productionRun.findFirst({
    where: {
      machineId: existing.machineId,
      status: RunStatus.RUNNING,
      id: { not: id },
    },
  });

  if (otherRunning) {
    throw new Error(
      `Machine ${existing.machine.name} already has active Run #${otherRunning.runNumber} running. Please complete or pause it first.`
    );
  }

  const updated = await db.$transaction(async (tx) => {
    const res = await tx.productionRun.update({
      where: { id },
      data: {
        status: RunStatus.RUNNING,
        startedAt: existing.startedAt || new Date(),
      },
    });

    // Set associated orders to IN_PRODUCTION
    const orderItems = await tx.patternCut.findMany({
      where: { cuttingPattern: { productionRunId: id } },
      select: { orderItem: { select: { orderId: true } } },
    });
    const orderIds = Array.from(
      new Set(
        orderItems
          .map((c) => c.orderItem?.orderId)
          .filter((orderId): orderId is string => typeof orderId === "string" && orderId.length > 0)
      )
    );

    if (orderIds.length > 0) {
      await tx.order.updateMany({
        where: { id: { in: orderIds }, status: { in: [OrderStatus.CONFIRMED, OrderStatus.PLANNED] } },
        data: { status: OrderStatus.IN_PRODUCTION },
      });
    }

    await logAudit(
      {
        userId,
        entityType: "ProductionRun",
        entityId: id,
        action: "START_RUN",
        before: { status: existing.status },
        after: { status: res.status, actionId: actionId || null },
      },
      tx
    );

    return res;
  });

  revalidatePath(`/production/${id}`);
  revalidatePath("/production");
  revalidateTag(DASHBOARD_TAG);
  revalidatePath("/operator");
  return updated;
}

export async function updatePatternProgress(
  runId: string,
  patternId: string,
  completedReps: number,
  actualKg?: number,
  actionId?: string
) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER, Role.OPERATOR);

  const pattern = await db.cuttingPattern.findFirst({
    where: { id: patternId },
  });

  if (!pattern) {
    throw new Error("Cutting pattern not found.");
  }

  const updated = await db.cuttingPattern.update({
    where: { id: patternId },
    data: {
      completedRepetitions: completedReps,
      actualKg: actualKg ? new Prisma.Decimal(actualKg) : undefined,
    },
  });

  revalidatePath(`/production/${runId}`);
  revalidatePath(`/operator/run/${runId}`);
  return updated;
}

export async function completeProductionRun(input: {
  runId: string;
  actualKg: number;
  trimWasteKg: number;
  wastageReason?: string;
  actionId?: string;
}) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER, Role.OPERATOR);

  const run = await db.productionRun.findFirst({
    where: { id: input.runId },
    include: {
      machine: true,
      patterns: {
        include: {
          cuts: {
            include: { orderItem: { include: { order: true } } },
          },
        },
      },
    },
  });

  if (!run) {
    throw new Error("Production run not found.");
  }

  if (run.status === RunStatus.COMPLETED) {
    return run; // Idempotent
  }

  const completed = await db.$transaction(async (tx) => {
    // 1. Update ProductionRun status
    const updatedRun = await tx.productionRun.update({
      where: { id: input.runId },
      data: {
        status: RunStatus.COMPLETED,
        completedAt: new Date(),
        totalActualKg: new Prisma.Decimal(input.actualKg.toFixed(3)),
      },
    });

    let validUserId: string | null = null;
    if (userId) {
      const userExists = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (userExists) {
        validUserId = userExists.id;
      } else {
        const firstUser = await tx.user.findFirst({ select: { id: true } });
        validUserId = firstUser?.id || null;
      }
    }

    // 2. Create WastageLog
    if (input.trimWasteKg > 0) {
      await tx.wastageLog.create({
        data: {
          productionRunId: input.runId,
          wastageKg: new Prisma.Decimal(input.trimWasteKg.toFixed(3)),
          wastageType: input.wastageReason || "TRIM",
          reason: input.wastageReason || "Edge Trim Wastage",
          createdById: validUserId,
        },
      });
    }

    // 3. For each cut in each pattern:
    //    - Calculate produced kg
    //    - Increment OrderItem.producedKg
    //    - Create StockItem reel
    const producedPerItem = new Map<string, number>();
    const { reelNumberPrefix } = await getSystemSettings();

    for (const pat of run.patterns) {
      const baseLengthM = Number((pat as any).runLengthM || 0);
      let lengthM = baseLengthM > 0 ? baseLengthM : pat.repetitions * 1000.0;
      if (pat.completedRepetitions > 0 && pat.repetitions > 0 && baseLengthM > 0) {
        lengthM = baseLengthM * (pat.completedRepetitions / pat.repetitions);
      } else if (pat.completedRepetitions > 0 && baseLengthM <= 0) {
        lengthM = pat.completedRepetitions * 1000.0;
      }

      for (const cut of pat.cuts) {
        const item = cut.orderItem;
        const widthM = Number(cut.widthInch) * 0.0254;
        const cutWeightKg = widthM * lengthM * (run.gsm / 1000.0) * cut.count;

        if (item) {
          const prev = producedPerItem.get(item.id) || 0;
          producedPerItem.set(item.id, prev + cutWeightKg);
        }

        // Create StockItem (Reel in warehouse)
        const reelNumber = await generateReelNumber(tx, reelNumberPrefix);

        await tx.stockItem.create({
          data: {
            reelNumber,
            widthInch: cut.widthInch,
            gsm: run.gsm,
            quantityKg: new Prisma.Decimal(cutWeightKg.toFixed(3)),
            status: item ? StockStatus.ALLOCATED : StockStatus.AVAILABLE,
            location: `BAY-${run.machine.code}-01`,
            orderItemId: item ? item.id : null,
            // Reels cut for an order take that line's paper type/size; others default.
            ...(item ? { paperType: item.paperType, size: item.size } : {}),
            productionRunId: input.runId,
          },
        });
      }
    }

    // 4. Update OrderItem producedKg
    const touchedOrderIds = new Set<string>();

    for (const [orderItemId, addKg] of producedPerItem.entries()) {
      const it = await tx.orderItem.update({
        where: { id: orderItemId },
        data: {
          producedKg: { increment: new Prisma.Decimal(addKg.toFixed(3)) },
        },
        include: { order: true },
      });
      touchedOrderIds.add(it.orderId);
    }

    // 5. Check order fulfillment status
    for (const orderId of touchedOrderIds) {
      const allItems = await tx.orderItem.findMany({
        where: { orderId },
      });

      const isAllFulfilled = allItems.every((it) => {
        const demand = Number(it.quantityKg);
        const tol = Number(it.tolerancePercent || 5.0);
        const minAcceptable = demand * (1.0 - tol / 100.0);
        const prod = Number(it.producedKg || 0);
        return prod >= minAcceptable;
      });

      if (isAllFulfilled) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.PRODUCED },
        });
      } else {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.IN_PRODUCTION },
        });
      }
    }

    // 6. AuditLog
    await logAudit(
      {
        userId: validUserId,
        entityType: "ProductionRun",
        entityId: input.runId,
        action: "COMPLETE_RUN",
        after: {
          actualKg: input.actualKg,
          trimWasteKg: input.trimWasteKg,
          ordersFulfilled: Array.from(touchedOrderIds).length,
          actionId: input.actionId || null,
        },
      },
      tx
    );

    return updatedRun;
  });

  revalidatePath(`/production/${input.runId}`);
  revalidatePath("/production");
  revalidateTag(DASHBOARD_TAG);
  revalidatePath("/operator");
  revalidatePath("/orders");
  return completed;
}

export async function cancelProductionRun(id: string, reason?: string) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);

  const existing = await db.productionRun.findFirst({
    where: { id },
    include: {
      patterns: {
        include: { cuts: { select: { orderItemId: true } } },
      },
    },
  });

  if (!existing) {
    throw new Error("Production run not found.");
  }

  if (existing.status === RunStatus.COMPLETED) {
    throw new Error("Completed production runs cannot be cancelled.");
  }

  const cancelled = await db.$transaction(async (tx) => {
    // 1. Set status to CANCELLED
    const res = await tx.productionRun.update({
      where: { id },
      data: { status: RunStatus.CANCELLED },
    });

    // 2. Collect involved orders and revert to CONFIRMED if not in another run
    const itemIds = Array.from(
      new Set(
        existing.patterns
          .flatMap((p) => p.cuts.map((c) => c.orderItemId))
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      )
    );

    const items =
      itemIds.length > 0
        ? await tx.orderItem.findMany({
            where: { id: { in: itemIds } },
            select: { orderId: true },
          })
        : [];
    const orderIds = Array.from(new Set(items.map((it) => it.orderId)));

    if (orderIds.length > 0) {
      await tx.order.updateMany({
        where: { id: { in: orderIds }, status: { in: [OrderStatus.PLANNED, OrderStatus.IN_PRODUCTION] } },
        data: { status: OrderStatus.CONFIRMED },
      });
    }

    await logAudit(
      {
        userId,
        entityType: "ProductionRun",
        entityId: id,
        action: "CANCEL_RUN",
        before: { status: existing.status },
        after: { status: res.status, reason: reason || null },
      },
      tx
    );

    return res;
  });

  revalidatePath(`/production/${id}`);
  revalidatePath("/production");
  revalidateTag(DASHBOARD_TAG);
  revalidatePath("/orders");
  return cancelled;
}
