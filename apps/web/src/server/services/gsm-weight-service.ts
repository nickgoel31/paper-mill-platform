"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role, Prisma } from "@/generated/prisma/browser";
import { logAudit } from "./audit-service";
import { revalidatePath } from "next/cache";

export interface GsmWeightProfileInput {
  gsm: number;
  kgPerInch: number;
  reelDiameterInch?: number | null;
  notes?: string | null;
}

export async function getGsmWeightProfiles() {
  await requireRole(Role.ADMIN, Role.PLANNER, Role.SALES, Role.OPERATOR, Role.DISPATCH);
  const rows = await db.gsmWeightProfile.findMany({ orderBy: { gsm: "asc" } });
  return rows.map((r) => ({
    ...r,
    kgPerInch: Number(r.kgPerInch),
    reelDiameterInch: r.reelDiameterInch != null ? Number(r.reelDiameterInch) : null,
  }));
}

/** Plain `{ gsm: kgPerInch }` map for the solver / weight estimates. */
export async function getGsmWeightMap(): Promise<Record<number, number>> {
  const rows = await db.gsmWeightProfile.findMany({ select: { gsm: true, kgPerInch: true } });
  const map: Record<number, number> = {};
  rows.forEach((r) => {
    map[r.gsm] = Number(r.kgPerInch);
  });
  return map;
}

function validate(input: GsmWeightProfileInput) {
  if (!Number.isInteger(input.gsm) || input.gsm < 40 || input.gsm > 600) {
    throw new Error("GSM must be a whole number between 40 and 600.");
  }
  if (!(input.kgPerInch > 0)) {
    throw new Error("kg per inch must be greater than 0.");
  }
  if (input.reelDiameterInch != null && input.reelDiameterInch <= 0) {
    throw new Error("Reel diameter must be greater than 0.");
  }
}

export async function createGsmWeightProfile(input: GsmWeightProfileInput) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);
  validate(input);

  const existing = await db.gsmWeightProfile.findFirst({ where: { gsm: input.gsm } });
  if (existing) throw new Error(`A weight profile for ${input.gsm} GSM already exists.`);

  const created = await db.$transaction(async (tx) => {
    const row = await tx.gsmWeightProfile.create({
      data: {
        gsm: input.gsm,
        kgPerInch: new Prisma.Decimal(input.kgPerInch.toFixed(4)),
        reelDiameterInch:
          input.reelDiameterInch != null ? new Prisma.Decimal(input.reelDiameterInch.toFixed(2)) : null,
        notes: input.notes?.trim() || null,
        createdById: userId,
      },
    });
    await logAudit({ userId, entityType: "GsmWeightProfile", entityId: row.id, action: "CREATE", after: row }, tx);
    return row;
  });

  revalidatePath("/masters/gsm-weights");
  revalidatePath("/deckle");
  return created;
}

export async function updateGsmWeightProfile(id: string, input: GsmWeightProfileInput) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);
  validate(input);

  const existing = await db.gsmWeightProfile.findFirst({ where: { id } });
  if (!existing) throw new Error("Weight profile not found.");

  if (existing.gsm !== input.gsm) {
    const dup = await db.gsmWeightProfile.findFirst({ where: { gsm: input.gsm } });
    if (dup && dup.id !== id) throw new Error(`A weight profile for ${input.gsm} GSM already exists.`);
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.gsmWeightProfile.update({
      where: { id },
      data: {
        gsm: input.gsm,
        kgPerInch: new Prisma.Decimal(input.kgPerInch.toFixed(4)),
        reelDiameterInch:
          input.reelDiameterInch != null ? new Prisma.Decimal(input.reelDiameterInch.toFixed(2)) : null,
        notes: input.notes?.trim() || null,
      },
    });
    await logAudit(
      { userId, entityType: "GsmWeightProfile", entityId: id, action: "UPDATE", before: existing, after: row },
      tx
    );
    return row;
  });

  revalidatePath("/masters/gsm-weights");
  revalidatePath("/deckle");
  return updated;
}

export async function deleteGsmWeightProfile(id: string) {
  const { userId } = await requireRole(Role.ADMIN, Role.PLANNER);

  const existing = await db.gsmWeightProfile.findFirst({ where: { id } });
  if (!existing) throw new Error("Weight profile not found.");

  await db.$transaction(async (tx) => {
    await tx.gsmWeightProfile.delete({ where: { id } });
    await logAudit({ userId, entityType: "GsmWeightProfile", entityId: id, action: "DELETE", before: existing }, tx);
  });

  revalidatePath("/masters/gsm-weights");
  revalidatePath("/deckle");
  return { id };
}
