"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role, LengthUnit, OrderStatus, Prisma } from "@/generated/prisma/browser";
import { logAudit } from "./audit-service";
import {
  QueryParams,
  parsePaginationParams,
  buildPaginatedResponse,
} from "./base-service";
import { revalidatePath } from "next/cache";
import { toInches } from "@/lib/units";
import { runWithTenantContext } from "@/lib/tenant-context";

export interface StockPresetQueryParams extends QueryParams {
  gsm?: number;
  shade?: string;
  isActive?: boolean;
}

export async function getStockPresets(params: StockPresetQueryParams = {}) {
  const { skip, take, search, sortBy, sortOrder } = parsePaginationParams(params);

  const where: Prisma.StockPresetWhereInput = {
    deletedAt: null,
    ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
    ...(params.gsm ? { gsm: Number(params.gsm) } : {}),
    ...(params.shade ? { shade: { contains: params.shade } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { code: { contains: search } },
            { description: { contains: search } },
            { defaultLocation: { contains: search } },
            { paperType: { contains: search } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.stockPreset.count({ where }),
    db.stockPreset.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy === "createdAt" ? "createdAt" : sortBy]: sortOrder },
      include: {
        createdBy: {
          select: { id: true, name: true, role: true },
        },
      },
    }),
  ]);

  return buildPaginatedResponse(
    rows.map((r) => ({
      ...r,
      widthInch: Number(r.widthInch),
      standardWeightKg: Number(r.standardWeightKg),
    })),
    total,
    Math.floor(skip / take) + 1,
    take
  );
}

export async function getAllActiveStockPresets() {
  const presets = await db.stockPreset.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: [{ gsm: "asc" }, { widthInch: "asc" }],
  });

  return presets.map((r) => ({
    ...r,
    widthInch: Number(r.widthInch),
    standardWeightKg: Number(r.standardWeightKg),
  }));
}

export async function createStockPreset(input: {
  name: string;
  code: string;
  /** As typed, in `widthUnit` (defaults to inches for old callers). */
  widthInch: number;
  widthUnit?: LengthUnit;
  gsm: number;
  standardWeightKg: number;
  defaultLocation?: string;
  shade?: string;
  bf?: string;
  paperType?: string;
  description?: string;
}) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER, Role.SALES);

  if (!input.name.trim()) throw new Error("Preset Name is required.");
  if (!input.code.trim()) throw new Error("Preset Code is required.");
  if (input.widthInch <= 0) throw new Error("Width must be greater than 0.");
  if (input.gsm <= 0) throw new Error("GSM must be greater than 0.");
  if (input.standardWeightKg <= 0) throw new Error("Standard weight must be greater than 0.");

  const widthUnit = input.widthUnit ?? LengthUnit.INCH;
  const widthInches = toInches(input.widthInch, widthUnit);

  const created = await db.$transaction(async (tx) => {
    const existing = await tx.stockPreset.findFirst({
      where: { code: input.code.trim().toUpperCase() },
    });
    if (existing && !existing.deletedAt) {
      throw new Error(`Preset code "${input.code}" already exists.`);
    }

    const preset = await tx.stockPreset.create({
      data: {
        name: input.name.trim(),
        code: input.code.trim().toUpperCase(),
        widthInch: new Prisma.Decimal(widthInches.toFixed(2)),
        dimensionUnit: widthUnit,
        gsm: input.gsm,
        standardWeightKg: new Prisma.Decimal(input.standardWeightKg.toFixed(3)),
        defaultLocation: input.defaultLocation?.trim() || "BAY-A (Primary Warehouse)",
        shade: input.shade?.trim() || "NATURAL",
        bf: input.bf?.trim() || "18BF",
        paperType: input.paperType?.trim() || "KRAFT",
        description: input.description?.trim() || null,
        createdById: userId,
      },
    });

    await logAudit(
      {
        userId,
        entityType: "StockPreset",
        entityId: preset.id,
        action: "CREATE",
        after: input,
      },
      tx
    );

    return preset;
  });

  revalidatePath("/masters/stock-presets");
  revalidatePath("/stock/new");
  return created;
}

export async function updateStockPreset(
  id: string,
  input: {
    name?: string;
    /** As typed, in `widthUnit` (defaults to inches for old callers). */
    widthInch?: number;
    widthUnit?: LengthUnit;
    gsm?: number;
    standardWeightKg?: number;
    defaultLocation?: string;
    shade?: string;
    bf?: string;
    paperType?: string;
    description?: string;
    isActive?: boolean;
  }
) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);

  const updated = await db.$transaction(async (tx) => {
    const existing = await tx.stockPreset.findFirst({ where: { id } });
    if (!existing) throw new Error("Preset not found.");

    const preset = await tx.stockPreset.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.widthInch !== undefined
          ? {
              widthInch: new Prisma.Decimal(
                toInches(input.widthInch, input.widthUnit ?? LengthUnit.INCH).toFixed(2)
              ),
              dimensionUnit: input.widthUnit ?? LengthUnit.INCH,
            }
          : {}),
        ...(input.gsm !== undefined ? { gsm: input.gsm } : {}),
        ...(input.standardWeightKg !== undefined
          ? { standardWeightKg: new Prisma.Decimal(input.standardWeightKg.toFixed(3)) }
          : {}),
        ...(input.defaultLocation !== undefined
          ? { defaultLocation: input.defaultLocation.trim() }
          : {}),
        ...(input.shade !== undefined ? { shade: input.shade.trim() } : {}),
        ...(input.bf !== undefined ? { bf: input.bf.trim() } : {}),
        ...(input.paperType !== undefined ? { paperType: input.paperType.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description.trim() } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    await logAudit(
      {
        userId,
        entityType: "StockPreset",
        entityId: preset.id,
        action: "UPDATE",
        before: existing,
        after: input,
      },
      tx
    );

    return preset;
  });

  revalidatePath("/masters/stock-presets");
  revalidatePath("/stock/new");
  return updated;
}

// -----------------------------------------------------------------------------
// CSV IMPORT
// -----------------------------------------------------------------------------

/**
 * Bulk-create stock presets from parsed CSV rows. `code` is your own custom id
 * (required, must be unique) — nothing here is auto-generated. A bad row is
 * reported and skipped rather than failing the whole file.
 */
export async function importStockPresetsCsv(rows: Record<string, string>[]) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER, Role.SALES);

  const errors: { row: number; message: string }[] = [];
  let created = 0;
  const usedCodes = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const r = rows[i];
    try {
      const code = r.code?.trim().toUpperCase() || "";
      const name = r.name?.trim() || "";
      const widthRaw = parseFloat(r.widthInch);
      const gsm = parseInt(r.gsm, 10);
      const standardWeightKg = parseFloat(r.standardWeightKg);
      const widthUnit = (r.widthUnit || "").toUpperCase() === "CM" ? LengthUnit.CM : LengthUnit.INCH;

      if (!code) throw new Error(`"code" is required.`);
      if (!name) throw new Error(`"name" is required.`);
      if (isNaN(widthRaw) || widthRaw <= 0) throw new Error(`Invalid "widthInch": "${r.widthInch}"`);
      if (isNaN(gsm) || gsm <= 0) throw new Error(`Invalid "gsm": "${r.gsm}"`);
      if (isNaN(standardWeightKg) || standardWeightKg <= 0) {
        throw new Error(`Invalid "standardWeightKg": "${r.standardWeightKg}"`);
      }
      if (usedCodes.has(code)) throw new Error(`Code "${code}" is duplicated within this file.`);

      const existing = await db.stockPreset.findFirst({ where: { code } });
      if (existing && !existing.deletedAt) throw new Error(`Code "${code}" already exists.`);

      const preset = await db.$transaction(async (tx) => {
        const row = await tx.stockPreset.create({
          data: {
            name,
            code,
            widthInch: new Prisma.Decimal(toInches(widthRaw, widthUnit).toFixed(2)),
            dimensionUnit: widthUnit,
            gsm,
            standardWeightKg: new Prisma.Decimal(standardWeightKg.toFixed(3)),
            defaultLocation: r.defaultLocation?.trim() || "BAY-A (Primary Warehouse)",
            shade: r.shade?.trim() || "NATURAL",
            bf: r.bf?.trim() || "18BF",
            paperType: r.paperType?.trim() || "KRAFT",
            description: r.description?.trim() || null,
            createdById: userId,
          },
        });
        await logAudit(
          { userId, entityType: "StockPreset", entityId: row.id, action: "CREATE", after: { source: "CSV import" } },
          tx
        );
        return row;
      });

      usedCodes.add(code);
      created++;
      void preset;
    } catch (err: any) {
      errors.push({ row: rowNum, message: err.message || "Failed to import row" });
    }
  }

  if (created > 0) {
    revalidatePath("/masters/stock-presets");
    revalidatePath("/stock/new");
  }
  return { created, errors };
}

// -----------------------------------------------------------------------------
// MONTHLY AUTO-DETECTED PRESETS (CRON)
// -----------------------------------------------------------------------------

/**
 * Ranks the trailing window's order-line configurations (width + GSM — the
 * same exact-match key the deckle solver and stock allocation use) by how
 * often and how much they were ordered, then creates or refreshes a
 * "AUTO-<gsm>-<width>" preset for the top N. Re-running it (e.g. next month)
 * updates the same preset codes instead of piling up duplicates, so ones that
 * fall out of the top N are simply left stale rather than deleted — a human
 * can deactivate them from Stock Presets if needed.
 */
async function generateStockPresetsForCurrentTenant(topN: number, monthsBack: number) {
  const periodStart = new Date();
  periodStart.setMonth(periodStart.getMonth() - monthsBack);
  const periodEnd = new Date();

  const items = await db.orderItem.findMany({
    where: {
      createdAt: { gte: periodStart, lte: periodEnd },
      order: { status: { not: OrderStatus.CANCELLED } },
    },
    select: { widthInch: true, gsm: true, quantityKg: true },
  });

  interface Group {
    widthInch: number;
    gsm: number;
    count: number;
    totalKg: number;
  }
  const groups = new Map<string, Group>();
  for (const it of items) {
    const width = Number(it.widthInch);
    const key = `${width.toFixed(2)}::${it.gsm}`;
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      g.totalKg += Number(it.quantityKg);
    } else {
      groups.set(key, { widthInch: width, gsm: it.gsm, count: 1, totalKg: Number(it.quantityKg) });
    }
  }

  const ranked = Array.from(groups.values())
    .sort((a, b) => b.count - a.count || b.totalKg - a.totalKg)
    .slice(0, topN);

  const monthLabel = periodStart.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  let created = 0;
  let updated = 0;
  for (const g of ranked) {
    const code = `AUTO-${g.gsm}-${g.widthInch.toFixed(2).replace(".", "P")}`;
    const avgKg = g.count > 0 ? g.totalKg / g.count : 0;
    const description = `Auto-detected top-ordered size (as of ${monthLabel}) — ordered ${g.count} time${
      g.count === 1 ? "" : "s"
    } in the trailing ${monthsBack} month${monthsBack === 1 ? "" : "s"}, ${avgKg.toFixed(0)} kg avg/reel.`;

    const existing = await db.stockPreset.findFirst({ where: { code } });
    if (existing) {
      await db.stockPreset.update({
        where: { id: existing.id },
        data: {
          standardWeightKg: new Prisma.Decimal(Math.max(avgKg, 1).toFixed(3)),
          description,
          isActive: true,
          deletedAt: null,
        },
      });
      updated++;
    } else {
      await db.stockPreset.create({
        data: {
          name: `${g.widthInch.toFixed(2)}" @ ${g.gsm} GSM (Auto — Top Ordered)`,
          code,
          widthInch: new Prisma.Decimal(g.widthInch.toFixed(2)),
          dimensionUnit: LengthUnit.INCH,
          gsm: g.gsm,
          standardWeightKg: new Prisma.Decimal(Math.max(avgKg, 1).toFixed(3)),
          defaultLocation: "BAY-A (Primary Warehouse)",
          shade: "NATURAL",
          bf: "18BF",
          paperType: "KRAFT",
          description,
        },
      });
      created++;
    }
  }

  return { created, updated, evaluated: groups.size, topN: ranked.length };
}

/**
 * Cron entry point: runs the auto-preset detection for every active tenant.
 * Called from `/api/cron/auto-stock-presets`, which the Cloudflare Worker's
 * `scheduled()` handler hits on a monthly trigger (see `worker-entry.ts`).
 */
export async function generateMonthlyStockPresets(options?: { topN?: number; monthsBack?: number }) {
  const topN = options?.topN ?? 12;
  const monthsBack = options?.monthsBack ?? 1;

  const tenants = await db.tenant.findMany({ where: { isActive: true }, select: { id: true, name: true } });

  const details: Array<{ tenantId: string; tenantName: string; created: number; updated: number; evaluated: number }> = [];
  for (const t of tenants) {
    const res = await runWithTenantContext(
      { tenantId: t.id, isPlatform: false },
      () => generateStockPresetsForCurrentTenant(topN, monthsBack)
    );
    details.push({ tenantId: t.id, tenantName: t.name, ...res });
  }

  return {
    tenants: details.length,
    created: details.reduce((s, r) => s + r.created, 0),
    updated: details.reduce((s, r) => s + r.updated, 0),
    details,
  };
}

export async function deleteStockPreset(id: string) {
  const { userId } = await requireRole(Role.ADMIN);

  await db.$transaction(async (tx) => {
    const existing = await tx.stockPreset.findFirst({ where: { id } });
    if (!existing) throw new Error("Preset not found.");

    await tx.stockPreset.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await logAudit(
      {
        userId,
        entityType: "StockPreset",
        entityId: id,
        action: "DELETE",
        before: existing,
      },
      tx
    );
  });

  revalidatePath("/masters/stock-presets");
  revalidatePath("/stock/new");
  return { success: true };
}
