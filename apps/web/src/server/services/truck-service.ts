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
import {
  transporterSchema,
  truckSchema,
  TransporterFormInput,
  TruckFormInput,
} from "@/lib/schemas/truck";
import { revalidatePath, revalidateTag } from "next/cache";
import { LOOKUP_TAGS } from "./cache-tags";

// -----------------------------------------------------------------------------
// TRANSPORTER ACTIONS
// -----------------------------------------------------------------------------

export async function getTransporters(params: QueryParams) {
  const { skip, take, search, sortBy, sortOrder } = parsePaginationParams(params);

  const where: Prisma.TransporterWhereInput = {
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { phone: { contains: search } },
            { gstin: { contains: search } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.transporter.count({ where }),
    db.transporter.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy === "createdAt" ? "name" : sortBy]: sortOrder },
      include: {
        _count: {
          select: {
            trucks: { where: { deletedAt: null } },
            loadBatches: true,
          },
        },
      },
    }),
  ]);

  return buildPaginatedResponse(rows, total, Math.floor(skip / take) + 1, take);
}

/**
 * Errors thrown from a Server Action are redacted to a generic message in
 * production. Catching here and returning `{ error }` instead of throwing is
 * what actually gets a readable message back to the toast.
 */
export async function createTransporter(data: TransporterFormInput) {
  try {
    const { userId } = await requireRole(Role.ADMIN);
    const parsed = transporterSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues.map((i) => i.message).join(" ") };
    }
    const validated = parsed.data;

    const transporter = await db.$transaction(async (tx) => {
      const created = await tx.transporter.create({
        data: {
          name: validated.name.trim(),
          phone: validated.phone.trim(),
          gstin: validated.gstin || null,
          isActive: validated.isActive,
          createdById: userId,
        },
      });

      await logAudit(
        {
          userId,
          entityType: "Transporter",
          entityId: created.id,
          action: "CREATE",
          after: created,
        },
        tx
      );

      return created;
    });

    revalidatePath("/masters/trucks");
    revalidateTag(LOOKUP_TAGS.trucks);
    revalidateTag(LOOKUP_TAGS.transporters);
    return { transporter };
  } catch (err: any) {
    return { error: err?.message || "Failed to create transporter." };
  }
}

export async function updateTransporter(id: string, data: TransporterFormInput) {
  try {
    const { userId } = await requireRole(Role.ADMIN);
    const parsed = transporterSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues.map((i) => i.message).join(" ") };
    }
    const validated = parsed.data;

    const existing = await db.transporter.findFirst({ where: { id } });
    if (!existing || existing.deletedAt) {
      return { error: "Transporter not found." };
    }

    const updated = await db.$transaction(async (tx) => {
      const res = await tx.transporter.update({
        where: { id },
        data: {
          name: validated.name.trim(),
          phone: validated.phone.trim(),
          gstin: validated.gstin || null,
          isActive: validated.isActive,
        },
      });

      await logAudit(
        {
          userId,
          entityType: "Transporter",
          entityId: id,
          action: "UPDATE",
          before: existing,
          after: res,
        },
        tx
      );

      return res;
    });

    revalidatePath("/masters/trucks");
    revalidateTag(LOOKUP_TAGS.trucks);
    revalidateTag(LOOKUP_TAGS.transporters);
    return { transporter: updated };
  } catch (err: any) {
    return { error: err?.message || "Failed to update transporter." };
  }
}

export async function deleteTransporter(id: string) {
  const { userId } = await requireRole(Role.ADMIN);

  const existing = await db.transporter.findFirst({
    where: { id },
    include: {
      loadBatches: {
        where: {
          status: { in: ["DRAFT", "PLANNED", "LOADING", "DISPATCHED"] },
        },
      },
    },
  });

  if (!existing || existing.deletedAt) {
    throw new Error("Transporter not found.");
  }

  if (existing.loadBatches.length > 0) {
    throw new Error(
      `Cannot delete transporter "${existing.name}". It is assigned to ${existing.loadBatches.length} active load batch(es).`
    );
  }

  const deleted = await db.$transaction(async (tx) => {
    const res = await tx.transporter.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    await logAudit(
      {
        userId,
        entityType: "Transporter",
        entityId: id,
        action: "DELETE",
        before: existing,
        after: res,
      },
      tx
    );

    return res;
  });

  revalidatePath("/masters/trucks");
  revalidateTag(LOOKUP_TAGS.trucks);
  revalidateTag(LOOKUP_TAGS.transporters);
  return deleted;
}

// -----------------------------------------------------------------------------
// TRUCK ACTIONS
// -----------------------------------------------------------------------------

export async function getTrucks(params: QueryParams) {
  const { skip, take, search, sortBy, sortOrder } = parsePaginationParams(params);

  const where: Prisma.TruckWhereInput = {
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { registrationNumber: { contains: search } },
            { owner: { name: { contains: search } } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.truck.count({ where }),
    db.truck.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy === "createdAt" ? "registrationNumber" : sortBy]: sortOrder },
      include: {
        owner: true,
        _count: {
          select: {
            loadBatches: {
              where: { status: { in: ["DRAFT", "PLANNED", "LOADING", "DISPATCHED"] } },
            },
          },
        },
      },
    }),
  ]);

  return buildPaginatedResponse(rows, total, Math.floor(skip / take) + 1, take);
}

export async function createTruck(data: TruckFormInput) {
  try {
    const { userId } = await requireRole(Role.ADMIN);
    const parsed = truckSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues.map((i) => i.message).join(" ") };
    }
    const validated = parsed.data;

    // Check unique registration number
    const existing = await db.truck.findFirst({
      where: { registrationNumber: validated.registrationNumber },
    });
    if (existing && !existing.deletedAt) {
      return { error: `Truck with registration "${validated.registrationNumber}" already exists.` };
    }

    const truck = await db.$transaction(async (tx) => {
      const created = await tx.truck.create({
        data: {
          registrationNumber: validated.registrationNumber,
          capacityKg: validated.capacityKg,
          transporterId: validated.transporterId || null,
          isActive: validated.isActive,
          createdById: userId,
        },
        include: { owner: true },
      });

      await logAudit(
        {
          userId,
          entityType: "Truck",
          entityId: created.id,
          action: "CREATE",
          after: created,
        },
        tx
      );

      return created;
    });

    revalidatePath("/masters/trucks");
    revalidateTag(LOOKUP_TAGS.trucks);
    revalidateTag(LOOKUP_TAGS.transporters);
    return { truck };
  } catch (err: any) {
    return { error: err?.message || "Failed to create truck." };
  }
}

export async function updateTruck(id: string, data: TruckFormInput) {
  try {
    const { userId } = await requireRole(Role.ADMIN);
    const parsed = truckSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues.map((i) => i.message).join(" ") };
    }
    const validated = parsed.data;

    const existing = await db.truck.findFirst({ where: { id } });
    if (!existing || existing.deletedAt) {
      return { error: "Truck not found." };
    }

    if (existing.registrationNumber !== validated.registrationNumber) {
      const duplicate = await db.truck.findFirst({
        where: { registrationNumber: validated.registrationNumber },
      });
      if (duplicate && duplicate.id !== id && !duplicate.deletedAt) {
        return { error: `Truck with registration "${validated.registrationNumber}" already exists.` };
      }
    }

    const updated = await db.$transaction(async (tx) => {
      const res = await tx.truck.update({
        where: { id },
        data: {
          registrationNumber: validated.registrationNumber,
          capacityKg: validated.capacityKg,
          transporterId: validated.transporterId || null,
          isActive: validated.isActive,
        },
        include: { owner: true },
      });

      await logAudit(
        {
          userId,
          entityType: "Truck",
          entityId: id,
          action: "UPDATE",
          before: existing,
          after: res,
        },
        tx
      );

      return res;
    });

    revalidatePath("/masters/trucks");
    revalidateTag(LOOKUP_TAGS.trucks);
    revalidateTag(LOOKUP_TAGS.transporters);
    return { truck: updated };
  } catch (err: any) {
    return { error: err?.message || "Failed to update truck." };
  }
}

export async function deleteTruck(id: string) {
  const { userId } = await requireRole(Role.ADMIN);

  const existing = await db.truck.findFirst({
    where: { id },
    include: {
      loadBatches: {
        where: {
          status: { in: ["DRAFT", "PLANNED", "LOADING", "DISPATCHED"] },
        },
      },
    },
  });

  if (!existing || existing.deletedAt) {
    throw new Error("Truck not found.");
  }

  if (existing.loadBatches.length > 0) {
    throw new Error(
      `Cannot delete truck "${existing.registrationNumber}". It is assigned to ${existing.loadBatches.length} active load batch(es).`
    );
  }

  const deleted = await db.$transaction(async (tx) => {
    const res = await tx.truck.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    await logAudit(
      {
        userId,
        entityType: "Truck",
        entityId: id,
        action: "DELETE",
        before: existing,
        after: res,
      },
      tx
    );

    return res;
  });

  revalidatePath("/masters/trucks");
  revalidateTag(LOOKUP_TAGS.trucks);
  revalidateTag(LOOKUP_TAGS.transporters);
  return deleted;
}
