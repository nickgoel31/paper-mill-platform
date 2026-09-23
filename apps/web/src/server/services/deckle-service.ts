"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role, OrderStatus, RunStatus, StockStatus, Prisma } from "@/generated/prisma/browser";
import { logAudit } from "./audit-service";
import { allocateStockToOrderItem } from "./stock-service";
import {
  callDeckleSolver,
  SolverRequestPayload,
  OptimizeResponse,
  type SolverFetch,
} from "@/lib/solver-client";
import { revalidatePath, revalidateTag } from "next/cache";
import { DASHBOARD_TAG } from "./cache-tags";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getGsmWeightMap } from "./gsm-weight-service";

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
      // Booking-only lines have no real size/GSM yet — never surface them
      // for planning until they're edited with real dimensions.
      isBookingOnly: false,
      // IN_PRODUCTION is included deliberately: it's the status an order
      // sits in the moment it falls short of full production — a
      // deallocated reel, a short/wasted run, etc. Without it, a line that's
      // gone through production once but still has unmet demand would never
      // resurface here for replanning or stock-matching.
      order: {
        status: { in: [OrderStatus.CONFIRMED, OrderStatus.PLANNED, OrderStatus.IN_PRODUCTION] },
      },
      // Exclude items already spoken for by an upcoming/in-progress run —
      // but NOT a COMPLETED one. A completed run's cuts are history; if the
      // line still has unmet demand after that (see above), it must be
      // replanned, not treated as already handled.
      patternCuts: {
        none: {
          cuttingPattern: {
            productionRun: {
              status: { in: [RunStatus.PLANNED, RunStatus.RELEASED, RunStatus.RUNNING] },
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
          orderDate: true,
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

  // Now that IN_PRODUCTION orders are in scope, some lines returned above may
  // already be fully (or near-enough, within tolerance) produced — e.g. the
  // sibling lines of an order that's short on just one line. Those aren't
  // "pending demand" and would only clutter the planner, so drop them here.
  const stillPending = items.filter((it) => {
    const demand = Number(it.quantityKg);
    const tol = Number(it.tolerancePercent || 5.0);
    const minAcceptable = demand * (1.0 - tol / 100.0);
    return Number(it.producedKg || 0) < minAcceptable;
  });

  return stillPending.map((it) => ({
    id: it.id,
    orderId: it.order.id,
    orderNumber: it.order.orderNumber,
    clientName: it.order.client.name,
    clientCode: it.order.client.code,
    clientCity: it.order.client.city,
    widthInch: Number(it.widthInch),
    gsm: it.gsm,
    paperType: it.paperType,
    quantityKg: Number(it.quantityKg),
    tolerancePercent: Number(it.tolerancePercent),
    producedKg: Number(it.producedKg || 0),
    deliveryDate: it.order.deliveryDate,
    orderDate: it.order.orderDate,
    priority: it.order.priority,
    kgPerInchOverride: it.kgPerInchOverride ? Number(it.kgPerInchOverride) : null,
  }));
}

// -----------------------------------------------------------------------------
// UNALLOCATED INVENTORY (for inventory-first planning)
// -----------------------------------------------------------------------------

/** Finished reels sitting free in inventory: AVAILABLE and not tied to any order. */
export async function getMatchableInventory() {
  await requireRole(Role.ADMIN, Role.PLANNER);

  const reels = await db.stockItem.findMany({
    where: { status: StockStatus.AVAILABLE, orderItemId: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      widthInch: true,
      gsm: true,
      quantityKg: true,
      location: true,
      createdAt: true,
      originOrderItemId: true,
    },
  });

  return reels.map((r) => ({
    id: r.id,
    widthInch: Number(r.widthInch),
    gsm: r.gsm,
    quantityKg: Number(r.quantityKg),
    location: r.location,
    createdAt: r.createdAt.toISOString(),
    originOrderItemId: r.originOrderItemId,
  }));
}

// -----------------------------------------------------------------------------
// SOLVER PROXY ACTION
// -----------------------------------------------------------------------------

/**
 * The solver's own weight/length estimate assumes a flat "1000m jumbo roll"
 * regardless of GSM. Where the mill has calibrated a real kg-per-inch for a
 * GSM (`GsmWeightProfile`), override `run_length_m` / `estimated_kg` with the
 * equivalent derived from that calibration — heavier GSM reels wind to a
 * shorter length on the same machine, so this keeps planning weight (and the
 * production-run weight computed from `run_length_m` at completion) close to
 * what actually comes off the winder. Trim % is a pure width ratio and is
 * left untouched.
 *
 * `overrideMap` (orderItemId -> kg/inch) lets a specific party's paper for
 * this GSM be calibrated differently from the mill's general chart — it only
 * changes that cut's *weight* estimate. `run_length_m` stays driven by the
 * mill's own chart value for the whole run: the physical length wound on the
 * machine is shared by every cut in the pattern, so one customer's override
 * can't change it — only what that cut's share of it is expected to weigh.
 */
function applyGsmWeightProfiles(
  response: OptimizeResponse,
  weightMap: Record<number, number>,
  overrideMap: Record<string, number> = {}
): OptimizeResponse {
  if (Object.keys(weightMap).length === 0 && Object.keys(overrideMap).length === 0) return response;

  const runs = response.runs.map((run) => {
    const millKgPerInch = weightMap[run.gsm];
    // No mill baseline for this GSM at all — nothing to derive run length
    // from, so leave the run untouched (an override alone can't drive the
    // physical winding length; see comment above).
    if (!millKgPerInch) return run;

    // Equivalent standard reel length (m) that yields `millKgPerInch` kg per
    // inch of width at this GSM: kgPerInch = 0.0254 * lengthM * gsm/1000.
    const equivalentLengthM = (millKgPerInch * 1000) / (0.0254 * run.gsm);

    let totalPlannedKg = 0;
    const patterns = run.patterns.map((pat) => {
      const runLengthM = equivalentLengthM * pat.repetitions;
      const estimatedKg = pat.cuts.reduce((acc, c) => {
        const rate = (c.order_item_id && overrideMap[c.order_item_id]) || millKgPerInch;
        return acc + c.width_inch * rate * pat.repetitions * c.count;
      }, 0);
      totalPlannedKg += estimatedKg;
      return { ...pat, run_length_m: runLengthM, estimated_kg: Math.round(estimatedKg) };
    });

    return { ...run, patterns, total_planned_kg: Math.round(totalPlannedKg) };
  });

  return {
    ...response,
    runs,
    summary: { ...response.summary, total_kg: Math.round(runs.reduce((a, r) => a + r.total_planned_kg, 0)) },
  };
}

/**
 * The solver picks lane counts to minimize trim% with no regard for how much
 * of that width is actually still needed — e.g. a 126" deckle fits exactly 3
 * lanes of a 42" reel at 0% trim, so it happily cuts 3 physical reels even
 * when the order only had one more reel's worth of demand left. That's not a
 * data bug, just a trim-vs-overproduction tradeoff the solver resolves the
 * wrong way for a single dominant width — so cap it here: any single-item
 * pattern (one order item, no one else sharing the width) has its lane count
 * capped so this run's cut of that item stays within ~10% of what was actually
 * asked for (payload.items[].quantity_kg, already net of what's produced so
 * far). Mixed-item patterns are left untouched — shrinking one item's lanes
 * there would also waste the other items' careful width-fit.
 */
function capSingleItemOverproduction(
  response: OptimizeResponse,
  machines: SolverRequestPayload["machines"],
  items: SolverRequestPayload["items"]
): OptimizeResponse {
  const machineById = new Map(machines.map((m) => [m.id, m]));
  const demandKgByItem: Record<string, number> = Object.fromEntries(
    items.map((it) => [it.order_item_id, it.quantity_kg])
  );
  const orderNumberByItem: Record<string, string> = Object.fromEntries(
    items.filter((it) => it.order_number).map((it) => [it.order_item_id, it.order_number as string])
  );
  const plannedSoFar: Record<string, number> = {};
  const warnings: string[] = [...response.warnings];

  const runs = response.runs.map((run) => {
    const machine = machineById.get(run.machine_id);
    let totalPlannedKg = 0;

    const patterns = run.patterns.map((pat) => {
      if (pat.cuts.length !== 1 || pat.cuts[0].count <= 1 || !machine) {
        totalPlannedKg += pat.estimated_kg;
        if (pat.cuts.length === 1) {
          plannedSoFar[pat.cuts[0].order_item_id] =
            (plannedSoFar[pat.cuts[0].order_item_id] || 0) + pat.estimated_kg;
        }
        return pat;
      }

      const cut = pat.cuts[0];
      const demand = demandKgByItem[cut.order_item_id];
      const already = plannedSoFar[cut.order_item_id] || 0;
      // No ground-truth demand for this id (e.g. a stock-preset filler item
      // with quantity_kg 0) — that's intentional filler, leave it alone.
      if (demand == null || demand <= 0) {
        totalPlannedKg += pat.estimated_kg;
        return pat;
      }

      const allowance = demand * 1.1; // 10% slack over the exact remaining ask
      const kgPerLane = pat.estimated_kg / cut.count;
      const remainingAllowance = allowance - already;
      const maxLanes = Math.max(1, Math.floor(remainingAllowance / Math.max(1, kgPerLane)));

      if (maxLanes >= cut.count) {
        totalPlannedKg += pat.estimated_kg;
        plannedSoFar[cut.order_item_id] = already + pat.estimated_kg;
        return pat;
      }

      const newCount = maxLanes;
      const newUsedWidth = Number((cut.width_inch * newCount).toFixed(2));
      const newTrimWidth = Number((machine.max_deckle_inch - newUsedWidth).toFixed(2));
      const newTrimPercent = Number(((newTrimWidth / machine.max_deckle_inch) * 100).toFixed(2));
      const newKg = Number((kgPerLane * newCount).toFixed(3));

      warnings.push(
        `Reduced ${orderNumberByItem[cut.order_item_id] || cut.order_item_id} (${cut.width_inch}" @ ${run.gsm} GSM) from ${cut.count} to ${newCount} lane(s) on ${machine.name} — the remaining order demand didn't justify cutting that many reels at once.`
      );

      totalPlannedKg += newKg;
      plannedSoFar[cut.order_item_id] = already + newKg;

      return {
        ...pat,
        cuts: [{ ...cut, count: newCount }],
        used_width_inch: newUsedWidth,
        trim_width_inch: newTrimWidth,
        trim_percent: newTrimPercent,
        estimated_kg: Math.round(newKg),
      };
    });

    const totalTrimKg = patterns.reduce((acc, p) => acc + (p.estimated_kg * p.trim_percent) / 100, 0);
    const avgTrimPct = totalPlannedKg > 0 ? (totalTrimKg / totalPlannedKg) * 100 : 0;

    return {
      ...run,
      patterns,
      total_planned_kg: Math.round(totalPlannedKg),
      total_trim_percent: Number(avgTrimPct.toFixed(2)),
    };
  });

  return {
    ...response,
    runs,
    warnings,
    summary: { ...response.summary, total_kg: Math.round(runs.reduce((a, r) => a + r.total_planned_kg, 0)) },
  };
}

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

  const result = await callDeckleSolver(payload, 35000, getSolverFetch());
  const weightMap = await getGsmWeightMap();

  // Per-order-line kg/inch overrides (a specific party's paper for this GSM),
  // for whichever order lines are actually in this payload.
  const orderItemIds = payload.items.map((it) => it.order_item_id).filter(Boolean);
  const overrideRows =
    orderItemIds.length > 0
      ? await db.orderItem.findMany({
          where: { id: { in: orderItemIds }, kgPerInchOverride: { not: null } },
          select: { id: true, kgPerInchOverride: true },
        })
      : [];
  const overrideMap: Record<string, number> = Object.fromEntries(
    overrideRows.map((o) => [o.id, Number(o.kgPerInchOverride)])
  );

  const calibrated = applyGsmWeightProfiles(result, weightMap, overrideMap);
  return capSingleItemOverproduction(calibrated, payload.machines, payload.items);
}

// -----------------------------------------------------------------------------
// COMMIT PRODUCTION RUNS
// -----------------------------------------------------------------------------

export interface CommitRunsInput {
  solverPayload: any;
  /** Inventory reels the planner approved to fill sales orders instead of new production. */
  stockAllocations?: Array<{ stockItemId: string; orderItemId: string }>;
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

async function commitProductionRunsImpl(input: CommitRunsInput) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);

  const allocations = input.stockAllocations ?? [];
  if ((!input.runs || input.runs.length === 0) && allocations.length === 0) {
    throw new Error("Nothing to commit: no production runs and no inventory allocations.");
  }

  // 1. Inventory first. Make sure every approved reel is still free, then allocate
  //    them. Runs are created afterwards so the orders they touch end up PLANNED.
  if (allocations.length > 0) {
    const reels = await db.stockItem.findMany({
      where: { id: { in: allocations.map((a) => a.stockItemId) } },
      select: { id: true, status: true, orderItemId: true },
    });
    const byId = new Map(reels.map((r) => [r.id, r]));
    const taken = allocations.filter((a) => {
      const r = byId.get(a.stockItemId);
      return !r || r.status !== StockStatus.AVAILABLE || r.orderItemId !== null;
    });
    if (taken.length > 0) {
      throw new Error(
        `${taken.length} inventory reel(s) were allocated by someone else while you were planning. ` +
          `Nothing was committed — please re-run the plan.`
      );
    }
    for (const a of allocations) {
      const res = await allocateStockToOrderItem(a.stockItemId, a.orderItemId);
      if ("error" in res && res.error) {
        throw new Error(res.error);
      }
    }
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
  revalidatePath("/stock");
  revalidateTag(DASHBOARD_TAG);
  return { runs: createdRuns, allocated: allocations.length };
}

export type CommitRunsResult =
  | { success: true; runCount: number; patternCount: number; allocatedReels: number }
  | { success: false; error: string };

/**
 * Commit an approved deckle plan: allocate the approved inventory reels, then create
 * the production runs. Returns errors as data — thrown messages are hidden in
 * production builds, and the planner needs to see why a commit was refused.
 */
export async function commitProductionRuns(input: CommitRunsInput): Promise<CommitRunsResult> {
  try {
    const { runs, allocated } = await commitProductionRunsImpl(input);
    return {
      success: true,
      runCount: runs.length,
      patternCount: runs.reduce((acc: number, r: any) => acc + r.patterns.length, 0),
      allocatedReels: allocated,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to commit the plan.",
    };
  }
}

// -----------------------------------------------------------------------------
// STOCK-FIRST CHECK — don't cut what's already sitting in the warehouse
// -----------------------------------------------------------------------------

export interface StockMatchCandidate {
  stockItemId: string;
  reelNumber: string | null;
  quantityKg: number;
  location: string | null;
}

export interface StockMatchForDemand {
  orderItemId: string;
  candidates: StockMatchCandidate[];
}

type Fifoable = { reelNumber: string | null; createdAt: Date };

/** Oldest reel number first (reel numbers are zero-padded & monthly, so this is
 * chronological); falls back to `createdAt` for reels with no number. */
function byFifo(a: Fifoable, b: Fifoable): number {
  if (a.reelNumber && b.reelNumber && a.reelNumber !== b.reelNumber) {
    return a.reelNumber < b.reelNumber ? -1 : 1;
  }
  if (a.reelNumber && !b.reelNumber) return -1;
  if (!a.reelNumber && b.reelNumber) return 1;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

/**
 * For each pending demand item (not yet fully produced), any AVAILABLE
 * warehouse stock that already matches its width + GSM + paper type — so a
 * planner can assign it instead of cutting a fresh reel. Candidates are
 * FIFO-ordered (oldest reel first).
 */
export async function getStockMatchesForPendingDemand(): Promise<StockMatchForDemand[]> {
  await requireRole(Role.ADMIN, Role.PLANNER);

  const items = await getPendingDemandItems();
  const pending = items.filter((it) => it.quantityKg - it.producedKg > 0);
  if (pending.length === 0) return [];

  const available = await db.stockItem.findMany({
    where: { status: StockStatus.AVAILABLE },
    select: {
      id: true,
      widthInch: true,
      gsm: true,
      paperType: true,
      quantityKg: true,
      reelNumber: true,
      location: true,
      createdAt: true,
    },
  });

  const results: StockMatchForDemand[] = [];
  for (const item of pending) {
    const candidates = available
      .filter(
        (s) =>
          s.gsm === item.gsm &&
          s.paperType === item.paperType &&
          Math.abs(Number(s.widthInch) - item.widthInch) < 0.01
      )
      .sort(byFifo)
      .map((s) => ({
        stockItemId: s.id,
        reelNumber: s.reelNumber,
        quantityKg: Number(s.quantityKg),
        location: s.location,
      }));

    if (candidates.length > 0) {
      results.push({ orderItemId: item.id, candidates });
    }
  }

  return results;
}

/**
 * Assigns the FIFO-first matching AVAILABLE stock reel to a pending order
 * line instead of cutting a new one. Re-checks matches at call time so two
 * planners acting at once can't double-assign the same reel.
 */
export async function assignStockToOrderItem(orderItemId: string) {
  await requireRole(Role.ADMIN, Role.PLANNER);

  const orderItem = await db.orderItem.findFirst({
    where: { id: orderItemId },
    select: { widthInch: true, gsm: true, paperType: true },
  });
  if (!orderItem) throw new Error("Order line not found.");

  const candidates = await db.stockItem.findMany({
    where: { status: StockStatus.AVAILABLE, gsm: orderItem.gsm, paperType: orderItem.paperType },
    select: { id: true, widthInch: true, reelNumber: true, createdAt: true },
  });

  const matches = candidates
    .filter((s) => Math.abs(Number(s.widthInch) - Number(orderItem.widthInch)) < 0.01)
    .sort(byFifo);

  if (matches.length === 0) {
    throw new Error("No matching available stock found for this order line anymore — it may have just been taken.");
  }

  const chosen = matches[0];
  const result = await allocateStockToOrderItem(chosen.id, orderItemId);
  if ("error" in result && result.error) {
    throw new Error(result.error);
  }

  revalidatePath("/deckle");
  return { ...result.data, reelNumber: chosen.reelNumber };
}
