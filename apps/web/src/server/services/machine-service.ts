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
import { machineSchema, MachineFormInput } from "@/lib/schemas/machine";
import { revalidatePath } from "next/cache";

export async function getMachines(params: QueryParams) {
  const { skip, take, search, sortBy, sortOrder } = parsePaginationParams(params);

  const where: Prisma.MachineWhereInput = {
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { code: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.machine.count({ where }),
    db.machine.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy === "code" ? "code" : sortBy]: sortOrder },
      include: {
        _count: {
          select: { productionRuns: true },
        },
      },
    }),
  ]);

  return buildPaginatedResponse(rows, total, Math.floor(skip / take) + 1, take);
}

export async function createMachine(data: MachineFormInput) {
  const { userId } = await requireRole(Role.ADMIN);
  const validated = machineSchema.parse(data);

  // Check unique code & name
  const existingCode = await db.machine.findUnique({
    where: { code: validated.code.toUpperCase() },
  });
  if (existingCode && !existingCode.deletedAt) {
    throw new Error(`Machine code "${validated.code}" is already in use.`);
  }

  const existingName = await db.machine.findUnique({
    where: { name: validated.name.trim() },
  });
  if (existingName && !existingName.deletedAt) {
    throw new Error(`Machine name "${validated.name}" is already in use.`);
  }

  const machine = await db.$transaction(async (tx) => {
    const created = await tx.machine.create({
      data: {
        name: validated.name.trim(),
        code: validated.code.trim().toUpperCase(),
        maxDeckleInch: new Prisma.Decimal(validated.maxDeckleInch.toFixed(2)),
        minDeckleInch: new Prisma.Decimal(validated.minDeckleInch.toFixed(2)),
        minTrimInch: new Prisma.Decimal(validated.minTrimInch.toFixed(2)),
        maxTrimInch: new Prisma.Decimal(validated.maxTrimInch.toFixed(2)),
        minGsm: validated.minGsm,
        maxGsm: validated.maxGsm,
        speedMpm: validated.speedMpm || null,
        isActive: validated.isActive,
        createdById: userId,
      },
    });

    await logAudit(
      {
        userId,
        entityType: "Machine",
        entityId: created.id,
        action: "CREATE",
        after: created,
      },
      tx
    );

    return created;
  });

  revalidatePath("/masters/machines");
  revalidatePath("/");
  return machine;
}

export async function updateMachine(id: string, data: MachineFormInput) {
  const { userId } = await requireRole(Role.ADMIN);
  const validated = machineSchema.parse(data);

  const existing = await db.machine.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    throw new Error("Machine not found.");
  }

  // Check uniqueness if changed
  if (existing.code !== validated.code.toUpperCase()) {
    const duplicateCode = await db.machine.findUnique({
      where: { code: validated.code.toUpperCase() },
    });
    if (duplicateCode && duplicateCode.id !== id && !duplicateCode.deletedAt) {
      throw new Error(`Machine code "${validated.code}" is already in use.`);
    }
  }

  if (existing.name !== validated.name.trim()) {
    const duplicateName = await db.machine.findUnique({
      where: { name: validated.name.trim() },
    });
    if (duplicateName && duplicateName.id !== id && !duplicateName.deletedAt) {
      throw new Error(`Machine name "${validated.name}" is already in use.`);
    }
  }

  const updated = await db.$transaction(async (tx) => {
    const res = await tx.machine.update({
      where: { id },
      data: {
        name: validated.name.trim(),
        code: validated.code.trim().toUpperCase(),
        maxDeckleInch: new Prisma.Decimal(validated.maxDeckleInch.toFixed(2)),
        minDeckleInch: new Prisma.Decimal(validated.minDeckleInch.toFixed(2)),
        minTrimInch: new Prisma.Decimal(validated.minTrimInch.toFixed(2)),
        maxTrimInch: new Prisma.Decimal(validated.maxTrimInch.toFixed(2)),
        minGsm: validated.minGsm,
        maxGsm: validated.maxGsm,
        speedMpm: validated.speedMpm || null,
        isActive: validated.isActive,
      },
    });

    await logAudit(
      {
        userId,
        entityType: "Machine",
        entityId: id,
        action: "UPDATE",
        before: existing,
        after: res,
      },
      tx
    );

    return res;
  });

  revalidatePath("/masters/machines");
  revalidatePath("/");
  return updated;
}

export async function deleteMachine(id: string) {
  const { userId } = await requireRole(Role.ADMIN);

  const existing = await db.machine.findUnique({
    where: { id },
    include: {
      productionRuns: {
        where: {
          status: { in: ["PLANNED", "RELEASED", "RUNNING"] },
        },
      },
    },
  });

  if (!existing || existing.deletedAt) {
    throw new Error("Machine not found.");
  }

  if (existing.productionRuns.length > 0) {
    throw new Error(
      `Cannot delete machine "${existing.name}". It currently has ${existing.productionRuns.length} active or planned production run(s).`
    );
  }

  const deleted = await db.$transaction(async (tx) => {
    const res = await tx.machine.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    await logAudit(
      {
        userId,
        entityType: "Machine",
        entityId: id,
        action: "DELETE",
        before: existing,
        after: res,
      },
      tx
    );

    return res;
  });

  revalidatePath("/masters/machines");
  revalidatePath("/");
  return deleted;
}
