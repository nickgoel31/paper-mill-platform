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

export async function createWarehouseLocation(name: string) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Location name is required.");

  const existing = await db.warehouseLocation.findFirst({ where: { name: trimmed } });
  if (existing) throw new Error(`Location "${trimmed}" already exists.`);

  const created = await db.$transaction(async (tx) => {
    const row = await tx.warehouseLocation.create({ data: { name: trimmed, createdById: userId } });
    await logAudit({ userId, entityType: "WarehouseLocation", entityId: row.id, action: "CREATE", after: row }, tx);
    return row;
  });

  revalidatePath("/masters/locations");
  return created;
}

export async function updateWarehouseLocation(id: string, name: string) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Location name is required.");

  const existing = await db.warehouseLocation.findFirst({ where: { id } });
  if (!existing) throw new Error("Location not found.");

  if (existing.name !== trimmed) {
    const dup = await db.warehouseLocation.findFirst({ where: { name: trimmed } });
    if (dup && dup.id !== id) throw new Error(`Location "${trimmed}" already exists.`);
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
  return updated;
}

export async function deleteWarehouseLocation(id: string) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);

  const existing = await db.warehouseLocation.findFirst({ where: { id } });
  if (!existing) throw new Error("Location not found.");

  const inUse = await db.stockItem.count({ where: { location: existing.name } });
  if (inUse > 0) {
    throw new Error(`"${existing.name}" is used by ${inUse} stock item(s). Reassign or delete those first.`);
  }

  await db.$transaction(async (tx) => {
    await tx.warehouseLocation.delete({ where: { id } });
    await logAudit({ userId, entityType: "WarehouseLocation", entityId: id, action: "DELETE", before: existing }, tx);
  });

  revalidatePath("/masters/locations");
  return { id };
}
