"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import { logAudit } from "./audit-service";
import { revalidatePath } from "next/cache";

export async function getPaperTypeOptions() {
  await requireRole(Role.ADMIN, Role.PLANNER, Role.SALES, Role.OPERATOR, Role.DISPATCH);
  const rows = await db.paperTypeOption.findMany({ orderBy: { name: "asc" } });
  return rows;
}

/** Plain `{ value, label }` list for dropdowns. */
export async function getPaperTypeChoices(): Promise<{ value: string; label: string }[]> {
  const rows = await db.paperTypeOption.findMany({
    orderBy: { name: "asc" },
    select: { name: true, label: true },
  });
  return rows.map((r) => ({ value: r.name, label: r.label || r.name }));
}

export async function createPaperTypeOption(name: string, label?: string | null) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);
  const trimmed = name.trim().toUpperCase();
  if (!trimmed) throw new Error("Paper type name is required.");

  const existing = await db.paperTypeOption.findFirst({ where: { name: trimmed } });
  if (existing) throw new Error(`Paper type "${trimmed}" already exists.`);

  const created = await db.$transaction(async (tx) => {
    const row = await tx.paperTypeOption.create({
      data: { name: trimmed, label: label?.trim() || null, createdById: userId },
    });
    await logAudit({ userId, entityType: "PaperTypeOption", entityId: row.id, action: "CREATE", after: row }, tx);
    return row;
  });

  revalidatePath("/masters/paper-types");
  return created;
}

export async function updatePaperTypeOption(id: string, name: string, label?: string | null) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);
  const trimmed = name.trim().toUpperCase();
  if (!trimmed) throw new Error("Paper type name is required.");

  const existing = await db.paperTypeOption.findFirst({ where: { id } });
  if (!existing) throw new Error("Paper type not found.");

  if (existing.name !== trimmed) {
    const dup = await db.paperTypeOption.findFirst({ where: { name: trimmed } });
    if (dup && dup.id !== id) throw new Error(`Paper type "${trimmed}" already exists.`);
  }

  const oldName = existing.name;

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.paperTypeOption.update({
      where: { id },
      data: { name: trimmed, label: label?.trim() || null },
    });
    // Keep existing order/stock rows in sync with the rename so they don't
    // silently fall out of the dropdown's recognized values.
    if (oldName !== trimmed) {
      await tx.orderItem.updateMany({ where: { paperType: oldName }, data: { paperType: trimmed } });
      await tx.stockItem.updateMany({ where: { paperType: oldName }, data: { paperType: trimmed } });
    }
    await logAudit(
      { userId, entityType: "PaperTypeOption", entityId: id, action: "UPDATE", before: existing, after: row },
      tx
    );
    return row;
  });

  revalidatePath("/masters/paper-types");
  revalidatePath("/orders");
  revalidatePath("/stock");
  return updated;
}

export async function deletePaperTypeOption(id: string) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);

  const existing = await db.paperTypeOption.findFirst({ where: { id } });
  if (!existing) throw new Error("Paper type not found.");

  const [ordersInUse, stockInUse] = await Promise.all([
    db.orderItem.count({ where: { paperType: existing.name } }),
    db.stockItem.count({ where: { paperType: existing.name } }),
  ]);
  if (ordersInUse > 0 || stockInUse > 0) {
    throw new Error(
      `"${existing.name}" is used by ${ordersInUse} order line(s) and ${stockInUse} stock item(s). Reassign or delete those first.`
    );
  }

  await db.$transaction(async (tx) => {
    await tx.paperTypeOption.delete({ where: { id } });
    await logAudit({ userId, entityType: "PaperTypeOption", entityId: id, action: "DELETE", before: existing }, tx);
  });

  revalidatePath("/masters/paper-types");
  return { id };
}
