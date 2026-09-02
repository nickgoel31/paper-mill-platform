"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role, Prisma } from "@prisma/client";
import { logAudit } from "./audit-service";
import {
  QueryParams,
  parsePaginationParams,
  buildPaginatedResponse,
} from "./base-service";
import { revalidatePath } from "next/cache";

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
  widthInch: number;
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

  const created = await db.$transaction(async (tx) => {
    const existing = await tx.stockPreset.findUnique({
      where: { code: input.code.trim().toUpperCase() },
    });
    if (existing && !existing.deletedAt) {
      throw new Error(`Preset code "${input.code}" already exists.`);
    }

    const preset = await tx.stockPreset.create({
      data: {
        name: input.name.trim(),
        code: input.code.trim().toUpperCase(),
        widthInch: new Prisma.Decimal(input.widthInch.toFixed(2)),
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
    widthInch?: number;
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
    const existing = await tx.stockPreset.findUnique({ where: { id } });
    if (!existing) throw new Error("Preset not found.");

    const preset = await tx.stockPreset.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.widthInch !== undefined
          ? { widthInch: new Prisma.Decimal(input.widthInch.toFixed(2)) }
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

export async function deleteStockPreset(id: string) {
  const { userId } = await requireRole(Role.ADMIN);

  await db.$transaction(async (tx) => {
    const existing = await tx.stockPreset.findUnique({ where: { id } });
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
