"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import { logAudit } from "./audit-service";
import { revalidatePath } from "next/cache";

export async function getWarehouseLocations() {
  await requireRole(Role.ADMIN, Role.PLANNER, Role.SALES, Role.OPERATOR, Role.DISPATCH);
  const rows = await db.warehouseLocation.findMany({ orderBy: { name: "asc" } });
  return rows;
}

/** Plain string list for dropdowns. */
export async function getWarehouseLocationNames(): Promise<string[]> {
  const rows = await db.warehouseLocation.findMany({
    orderBy: { name: "asc" },
    select: { name: true },
  });
  return rows.map((r) => r.name);
}

/** The first location ever created (oldest), used as the default bay when none is specified. */
export async function getFirstWarehouseLocationName(): Promise<string | null> {
  const row = await db.warehouseLocation.findFirst({
    orderBy: { createdAt: "asc" },
    select: { name: true },
  });
  return row?.name || null;
}

/**
 * Errors thrown from a Server Action are redacted to a generic message in
 * production. Catching here and returning `{ error }` instead of throwing is
 * what actually gets a readable message back to the toast.
 */
export async function createWarehouseLocation(name: string) {
  try {
    const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);
    const trimmed = name.trim();
    if (!trimmed) return { error: "Location name is required." };

    const existing = await db.warehouseLocation.findFirst({ where: { name: trimmed } });
    if (existing) return { error: `Location "${trimmed}" already exists.` };

    const created = await db.$transaction(async (tx) => {
      const row = await tx.warehouseLocation.create({ data: { name: trimmed, createdById: userId } });
      await logAudit({ userId, entityType: "WarehouseLocation", entityId: row.id, action: "CREATE", after: row }, tx);
      return row;
    });

    revalidatePath("/masters/locations");
    return { location: created };
  } catch (err: any) {
    return { error: err?.message || "Failed to create location." };
  }
}

export async function updateWarehouseLocation(id: string, name: string) {
  try {
    const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);
    const trimmed = name.trim();
    if (!trimmed) return { error: "Location name is required." };

    const existing = await db.warehouseLocation.findFirst({ where: { id } });
    if (!existing) return { error: "Location not found." };

    if (existing.name !== trimmed) {
      const dup = await db.warehouseLocation.findFirst({ where: { name: trimmed } });
      if (dup && dup.id !== id) return { error: `Location "${trimmed}" already exists.` };
    }

    const oldName = existing.name;

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.warehouseLocation.update({ where: { id }, data: { name: trimmed } });
      // Keep existing stock rows in sync with the rename so filters/labels don't go stale.
      await tx.stockItem.updateMany({ where: { location: oldName }, data: { location: trimmed } });
      await logAudit(
        { userId, entityType: "WarehouseLocation", entityId: id, action: "UPDATE", before: existing, after: row },
        tx
      );
      return row;
    });

    revalidatePath("/masters/locations");
    revalidatePath("/stock");
    return { location: updated };
  } catch (err: any) {
    return { error: err?.message || "Failed to update location." };
  }
}

export async function deleteWarehouseLocation(id: string) {
  try {
    const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);

    const existing = await db.warehouseLocation.findFirst({ where: { id } });
    if (!existing) return { error: "Location not found." };

    const inUse = await db.stockItem.count({ where: { location: existing.name } });
    if (inUse > 0) {
      return { error: `"${existing.name}" is used by ${inUse} stock item(s). Reassign or delete those first.` };
    }

    await db.$transaction(async (tx) => {
      await tx.warehouseLocation.delete({ where: { id } });
      await logAudit({ userId, entityType: "WarehouseLocation", entityId: id, action: "DELETE", before: existing }, tx);
    });

    revalidatePath("/masters/locations");
    return { id };
  } catch (err: any) {
    return { error: err?.message || "Failed to delete location." };
  }
}
