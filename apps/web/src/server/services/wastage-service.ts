"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role, Prisma } from "@/generated/prisma/browser";
import { logAudit } from "./audit-service";
import {
  QueryParams,
  parsePaginationParams,
  buildPaginatedResponse,
} from "./base-service";
import { revalidatePath } from "next/cache";

export interface WastageQueryParams extends QueryParams {
  machineId?: string;
  wastageType?: string;
  gsm?: number;
  dateFrom?: string;
  dateTo?: string;
}

export async function getWastageLogs(params: WastageQueryParams) {
  const { skip, take, search, sortBy, sortOrder } = parsePaginationParams(params);

  const where: Prisma.WastageLogWhereInput = {
    ...(search
      ? {
          OR: [
            { reason: { contains: search } },
            { productionRun: { runNumber: { contains: search } } },
            { productionRun: { machine: { name: { contains: search } } } },
          ],
        }
      : {}),
    ...(params.machineId
      ? { productionRun: { machineId: params.machineId } }
      : {}),
    ...(params.wastageType ? { wastageType: params.wastageType } : {}),
    ...(params.gsm ? { productionRun: { gsm: Number(params.gsm) } } : {}),
    ...(params.dateFrom || params.dateTo
      ? {
          recordedAt: {
            ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
            ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.wastageLog.count({ where }),
    db.wastageLog.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy === "createdAt" ? "recordedAt" : sortBy]: sortOrder },
      include: {
        productionRun: {
          include: {
            machine: { select: { id: true, name: true, code: true } },
          },
        },
        createdBy: { select: { id: true, name: true, role: true } },
      },
    }),
  ]);

  return buildPaginatedResponse(rows, total, Math.floor(skip / take) + 1, take);
}

export async function createManualWastageLog(input: {
  productionRunId?: string;
  wastageKg: number;
  wastageType: string;
  reason: string;
}) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER, Role.DISPATCH);

  if (input.wastageKg <= 0) {
    throw new Error("Wastage quantity must be greater than zero.");
  }

  const created = await db.$transaction(async (tx) => {
    const log = await tx.wastageLog.create({
      data: {
        productionRunId: input.productionRunId || null,
        wastageKg: new Prisma.Decimal(input.wastageKg.toFixed(3)),
        wastageType: input.wastageType || "OTHER",
        reason: input.reason,
        createdById: userId,
        recordedAt: new Date(),
      },
      include: {
        productionRun: true,
      },
    });

    await logAudit(
      {
        userId,
        entityType: "WastageLog",
        entityId: log.id,
        action: "CREATE_MANUAL_WASTAGE",
        after: {
          wastageKg: input.wastageKg,
          wastageType: input.wastageType,
          reason: input.reason,
          runNumber: log.productionRun?.runNumber || "NONE",
        },
      },
      tx
    );

    return log;
  });

  revalidatePath("/wastage");
  return created;
}

export async function getWastageAnalytics(dateRangeDays: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - dateRangeDays);

  // 1. Runs within date range
  const runs = await db.productionRun.findMany({
    where: {
      createdAt: { gte: startDate },
      status: { notIn: ["CANCELLED"] },
    },
    include: {
      machine: { select: { id: true, name: true, code: true } },
      wastageLogs: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // 2. Trend Data (Daily Average Trim %)
  const dailyMap = new Map<string, { totalTrim: number; count: number; plannedKg: number; actualKg: number }>();
  runs.forEach((r) => {
    const dateStr = new Date(r.createdAt).toISOString().split("T")[0];
    const prev = dailyMap.get(dateStr) || { totalTrim: 0, count: 0, plannedKg: 0, actualKg: 0 };
    dailyMap.set(dateStr, {
      totalTrim: prev.totalTrim + Number(r.totalTrimPercent || 0),
      count: prev.count + 1,
      plannedKg: prev.plannedKg + Number(r.totalPlannedKg || 0),
      actualKg: prev.actualKg + Number(r.totalActualKg || 0),
    });
  });

  const trendData = Array.from(dailyMap.entries()).map(([date, d]) => ({
    date,
    avgTrimPercent: Number((d.totalTrim / d.count).toFixed(2)),
    runsCount: d.count,
    plannedKg: d.plannedKg,
    actualKg: d.actualKg,
  }));

  // 3. Machine Comparison
  const machineMap = new Map<string, { name: string; totalTrim: number; count: number; totalKg: number }>();
  runs.forEach((r) => {
    const mId = r.machine.id;
    const prev = machineMap.get(mId) || {
      name: r.machine.name,
      totalTrim: 0,
      count: 0,
      totalKg: 0,
    };
    machineMap.set(mId, {
      name: r.machine.name,
      totalTrim: prev.totalTrim + Number(r.totalTrimPercent || 0),
      count: prev.count + 1,
      totalKg: prev.totalKg + Number(r.totalPlannedKg || 0),
    });
  });

  const machineComparison = Array.from(machineMap.values()).map((m) => ({
    machineName: m.name,
    avgTrimPercent: Number((m.totalTrim / m.count).toFixed(2)),
    runsCount: m.count,
    totalKg: m.totalKg,
  }));

  // 4. GSM Comparison
  const gsmMap = new Map<number, { gsm: number; totalTrim: number; count: number; totalKg: number }>();
  runs.forEach((r) => {
    const g = r.gsm;
    const prev = gsmMap.get(g) || { gsm: g, totalTrim: 0, count: 0, totalKg: 0 };
    gsmMap.set(g, {
      gsm: g,
      totalTrim: prev.totalTrim + Number(r.totalTrimPercent || 0),
      count: prev.count + 1,
      totalKg: prev.totalKg + Number(r.totalPlannedKg || 0),
    });
  });

  const gsmComparison = Array.from(gsmMap.values())
    .sort((a, b) => a.gsm - b.gsm)
    .map((g) => ({
      gsm: `${g.gsm} GSM`,
      avgTrimPercent: Number((g.totalTrim / g.count).toFixed(2)),
      runsCount: g.count,
      totalKg: g.totalKg,
    }));

  // 5. Wastage Type Breakdown
  const allLogs = await db.wastageLog.findMany({
    where: { recordedAt: { gte: startDate } },
    select: { wastageType: true, wastageKg: true },
  });

  const typeMap = new Map<string, number>();
  allLogs.forEach((l) => {
    const t = l.wastageType || "OTHER";
    typeMap.set(t, (typeMap.get(t) || 0) + Number(l.wastageKg));
  });

  const typeBreakdown = Array.from(typeMap.entries()).map(([type, totalKg]) => ({
    type:
      type === "TRIM"
        ? "Normal Edge Trim"
        : type === "REJECT"
        ? "Paper Break / Reject"
        : "Scrap & Handling",
    value: Math.round(totalKg),
  }));

  // 6. Worst Runs (Top 10 highest trim %)
  const worstRuns = await db.productionRun.findMany({
    where: {
      createdAt: { gte: startDate },
      status: { notIn: ["CANCELLED"] },
    },
    orderBy: { totalTrimPercent: "desc" },
    take: 10,
    include: {
      machine: { select: { name: true, code: true } },
    },
  });

  // 7. Theoretical vs Actual Variance
  let theoreticalTrimKgTotal = 0;
  let operatorWastageKgTotal = 0;

  runs.forEach((r) => {
    const plannedKg = Number(r.totalPlannedKg || 0);
    const trimPct = Number(r.totalTrimPercent || 0);
    theoreticalTrimKgTotal += plannedKg * (trimPct / 100);

    const actualLogged = r.wastageLogs.reduce(
      (acc, l) => acc + Number(l.wastageKg || 0),
      0
    );
    operatorWastageKgTotal += actualLogged;
  });

  const varianceKg = operatorWastageKgTotal - theoreticalTrimKgTotal;
  const variancePct =
    theoreticalTrimKgTotal > 0
      ? (varianceKg / theoreticalTrimKgTotal) * 100
      : 0;

  return {
    trendData,
    machineComparison,
    gsmComparison,
    typeBreakdown,
    worstRuns: worstRuns.map((r) => ({
      id: r.id,
      runNumber: r.runNumber,
      machineName: r.machine.name,
      gsm: r.gsm,
      trimPercent: Number(r.totalTrimPercent || 0),
      totalPlannedKg: Number(r.totalPlannedKg || 0),
      date: new Date(r.createdAt).toLocaleDateString("en-IN"),
    })),
    theoreticalTrimKg: Math.round(theoreticalTrimKgTotal),
    operatorWastageKg: Math.round(operatorWastageKgTotal),
    varianceKg: Math.round(varianceKg),
    variancePct: Number(variancePct.toFixed(1)),
  };
}
