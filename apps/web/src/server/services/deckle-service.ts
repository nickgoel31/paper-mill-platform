"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role, OrderStatus, RunStatus, Prisma } from "@/generated/prisma/browser";
import { logAudit } from "./audit-service";
import {
  callDeckleSolver,
  SolverRequestPayload,
  OptimizeResponse,
  type SolverFetch,
} from "@/lib/solver-client";
import { revalidatePath, revalidateTag } from "next/cache";
import { DASHBOARD_TAG } from "./cache-tags";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * The `SOLVER` service binding's fetch, when running on Cloudflare. Worker-to-
 * Worker calls to the solver's public URL fail with CF error 1042, so we route
 * through the binding instead. Returns `undefined` off-Worker (local dev), where
 * `callDeckleSolver` falls back to a plain `fetch` of `SOLVER_SERVICE_URL`.
 */
function getSolverFetch(): SolverFetch | undefined {
  try {
    const binding = (
      getCloudflareContext() as unknown as {
        env?: { SOLVER?: { fetch: SolverFetch } };
      }
    ).env?.SOLVER;
    if (binding?.fetch) return (input, init) => binding.fetch(input, init);
  } catch {
    // not on a Worker
  }
  return undefined;
}

// -----------------------------------------------------------------------------
// RUN NUMBER GENERATOR (Monthly Reset: PR-YYMM-0001)
// -----------------------------------------------------------------------------

export async function generateRunNumber(
  tx: Prisma.TransactionClient,
  date: Date = new Date()
): Promise<string> {
  const d = new Date(date);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const prefix = `PR-${yy}${mm}-`;

  const latestRun = await tx.productionRun.findFirst({
    where: {
      runNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      runNumber: "desc",
    },
    select: {
      runNumber: true,
    },
  });

  let nextSequence = 1;
  if (latestRun && latestRun.runNumber) {
    const parts = latestRun.runNumber.split("-");
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
// QUERY PENDING DEMAND ITEMS
// -----------------------------------------------------------------------------

export async function getPendingDemandItems() {
  await requireRole(Role.ADMIN, Role.PLANNER);

  const items = await db.orderItem.findMany({
    where: {
      order: {
        status: { in: [OrderStatus.CONFIRMED, OrderStatus.PLANNED] },
      },
      // Exclude items already assigned to active (non-cancelled) production runs
      patternCuts: {
        none: {
          cuttingPattern: {
            productionRun: {
              status: { notIn: [RunStatus.CANCELLED] },
            },
          },
        },
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
      { gsm: "asc" },
      { order: { deliveryDate: "asc" } },
    ],
  });

  return items.map((it) => ({
    id: it.id,
    orderId: it.order.id,
    orderNumber: it.order.orderNumber,
    clientName: it.order.client.name,
    clientCode: it.order.client.code,
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
// SOLVER PROXY ACTION
// -----------------------------------------------------------------------------

export async function runSolverOptimization(
  payload: SolverRequestPayload
): Promise<OptimizeResponse> {
  await requireRole(Role.ADMIN, Role.PLANNER);

  if (payload.options?.use_stock_presets) {
    const demandedGsms = Array.from(new Set(payload.items.map((it) => it.gsm)));
    
    if (demandedGsms.length > 0) {
      const presets = await db.stockPreset.findMany({
        where: {
          isActive: true,
          gsm: { in: demandedGsms },
        },
      });

      for (const preset of presets) {
        payload.items.push({
          order_item_id: preset.id,
          order_number: "STOCK",
          width_inch: Number(preset.widthInch),
          gsm: preset.gsm,
          quantity_kg: 0,
          tolerance_percent: 0,
          priority: "STOCK",
        });
      }
    }
  }

  return callDeckleSolver(payload, 35000, getSolverFetch());
}

// -----------------------------------------------------------------------------
// COMMIT PRODUCTION RUNS
// -----------------------------------------------------------------------------

export interface CommitRunsInput {
  solverPayload: any;
  runs: Array<{
    machineId: string;
    gsm: number;
    totalTrimPercent: number;
    totalPlannedKg: number;
    patterns: Array<{
      sequence: number;
      repetitions: number;
      runLengthM?: number;
      usedWidthInch: number;
      trimWidthInch: number;
      trimPercent: number;
      estimatedKg: number;
      isManuallyEdited?: boolean;
      cuts: Array<{
        orderItemId: string;
        widthInch: number;
        count: number;
      }>;
    }>;
  }>;
}

export async function commitProductionRuns(input: CommitRunsInput) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);

  if (!input.runs || input.runs.length === 0) {
    throw new Error("No production runs provided for commitment.");
  }

  const createdRuns = await db.$transaction(async (tx) => {
    const committed: any[] = [];
    const involvedOrderItemIds = new Set<string>();

    const allCutIds = new Set<string>();
    for (const runData of input.runs) {
      for (const pat of runData.patterns) {
        for (const c of pat.cuts) {
          allCutIds.add(c.orderItemId);
        }
      }
    }

    const existingOrderItems = await tx.orderItem.findMany({
      where: { id: { in: Array.from(allCutIds) } },
      select: { id: true },
    });
    const validOrderItemIdSet = new Set(existingOrderItems.map((o) => o.id));

    // Verify if userId exists in User table to avoid foreign key violations
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

    for (const runData of input.runs) {
      const runNumber = await generateRunNumber(tx);

      // Collect only real customer item IDs for status progression
      for (const pat of runData.patterns) {
        for (const c of pat.cuts) {
          if (validOrderItemIdSet.has(c.orderItemId)) {
            involvedOrderItemIds.add(c.orderItemId);
          }
        }
      }

      const createdRun = await tx.productionRun.create({
        data: {
          runNumber,
          machineId: runData.machineId,
          gsm: runData.gsm,
          status: RunStatus.PLANNED,
          totalPlannedKg: new Prisma.Decimal(runData.totalPlannedKg.toFixed(3)),
          totalTrimPercent: new Prisma.Decimal(runData.totalTrimPercent.toFixed(2)),
          solverPayload: input.solverPayload || null,
          createdById: validUserId,
          patterns: {
            create: runData.patterns.map((p) => ({
              sequence: p.sequence,
              repetitions: p.repetitions,
              runLengthM: p.runLengthM || (p.repetitions * 1000.0),
              usedWidthInch: new Prisma.Decimal(p.usedWidthInch.toFixed(2)),
              trimWidthInch: new Prisma.Decimal(p.trimWidthInch.toFixed(2)),
              trimPercent: new Prisma.Decimal(p.trimPercent.toFixed(2)),
              estimatedKg: new Prisma.Decimal(p.estimatedKg.toFixed(3)),
              isManuallyEdited: p.isManuallyEdited || false,
              cuts: {
                create: p.cuts.map((c) => {
                  const isOrderItem = validOrderItemIdSet.has(c.orderItemId);
                  return {
                    orderItemId: isOrderItem ? c.orderItemId : null,
                    stockPresetId: isOrderItem ? null : c.orderItemId,
                    widthInch: new Prisma.Decimal(c.widthInch.toFixed(2)),
                    count: c.count,
                  };
                }),
              },
            })),
          },
        },
        include: {
          patterns: { include: { cuts: true } },
          machine: true,
        },
      });

      await logAudit(
        {
          userId: validUserId,
          entityType: "ProductionRun",
          entityId: createdRun.id,
          action: "CREATE",
          after: {
            runNumber: createdRun.runNumber,
            machine: createdRun.machine.name,
            gsm: createdRun.gsm,
            plannedKg: runData.totalPlannedKg,
            trimPercent: runData.totalTrimPercent,
            patternCount: runData.patterns.length,
          },
        },
        tx
      );

      committed.push(createdRun);
    }

    // Set all involved orders to status PLANNED
    const items = await tx.orderItem.findMany({
      where: { id: { in: Array.from(involvedOrderItemIds) } },
      select: { orderId: true },
    });
    const orderIds = Array.from(new Set(items.map((it) => it.orderId)));

    if (orderIds.length > 0) {
      await tx.order.updateMany({
        where: { id: { in: orderIds } },
        data: { status: OrderStatus.PLANNED },
      });
    }

    return committed;
  });

  revalidatePath("/production");
  revalidatePath("/deckle");
  revalidatePath("/orders");
  revalidateTag(DASHBOARD_TAG);
  return createdRuns;
}
