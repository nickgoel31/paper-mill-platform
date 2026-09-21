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
import { machineSchema, MachineFormInput, MachineActionResult } from "@/lib/schemas/machine";
import { revalidatePath, revalidateTag } from "next/cache";
import { ZodError } from "zod";
import { LOOKUP_TAGS } from "./cache-tags";

/** Turn any thrown error into a message safe and useful to show the user. */
function friendlyError(err: unknown): string {
  if (err instanceof ZodError) {
    return err.issues.map((i) => i.message).join(" ");
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/unique constraint/i.test(msg)) {
    return "A machine with this name or code already exists.";
  }
  return msg || "Something went wrong. Please try again.";
}

/**
 * Deleted machines are soft-deleted (`deletedAt`), but the database's unique
 * (mill, name) and (mill, code) constraints still see them. Rename any deleted
 * machine that holds the name/code being claimed so the new one can use it.
 */
async function releaseDeletedNameAndCode(code: string, name: string, exceptId?: string) {
  const stale = await db.machine.findMany({
    where: {
      deletedAt: { not: null },
      OR: [{ code }, { name }],
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  });
  for (const m of stale) {
    const tag = m.id.slice(-6);
    await db.machine.update({
      where: { id: m.id },
      data: {
        code: m.code === code ? `${m.code}~${tag}` : m.code,
        name: m.name === name ? `${m.name} [deleted ${tag}]` : m.name,
      },
    });
  }
}

export async function getMachines(params: QueryParams) {
  const { skip, take, search, sortBy, sortOrder } = parsePaginationParams(params);

  const where: Prisma.MachineWhereInput = {
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { code: { contains: search } },
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

async function createMachineImpl(data: MachineFormInput) {
  const { userId } = await requireRole(Role.ADMIN);
  const validated = machineSchema.parse(data);

  // Check unique code & name
  const existingCode = await db.machine.findFirst({
    where: { code: validated.code.toUpperCase() },
  });
  if (existingCode && !existingCode.deletedAt) {
    throw new Error(`Machine code "${validated.code}" is already in use.`);
  }

  const existingName = await db.machine.findFirst({
    where: { name: validated.name.trim() },
  });
  if (existingName && !existingName.deletedAt) {
    throw new Error(`Machine name "${validated.name}" is already in use.`);
  }

  await releaseDeletedNameAndCode(validated.code.trim().toUpperCase(), validated.name.trim());

  const machine = await db.$transaction(async (tx) => {
    const created = await tx.machine.create({
      data: {
        name: validated.name.trim(),
        code: validated.code.trim().toUpperCase(),
        maxDeckleInch: new Prisma.Decimal(validated.maxDeckleInch.toFixed(2)),
        minDeckleInch: new Prisma.Decimal(validated.minDeckleInch.toFixed(2)),
        minTrimInch: new Prisma.Decimal(validated.minTrimInch.toFixed(2)),
        maxTrimInch: new Prisma.Decimal(validated.maxTrimInch.toFixed(2)),
        trimMode: validated.trimMode,
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
  revalidateTag(LOOKUP_TAGS.machines);
  return machine;
}

async function updateMachineImpl(id: string, data: MachineFormInput) {
  const { userId } = await requireRole(Role.ADMIN);
  const validated = machineSchema.parse(data);

  const existing = await db.machine.findFirst({ where: { id } });
  if (!existing || existing.deletedAt) {
    throw new Error("Machine not found.");
  }

  // Check uniqueness if changed
  if (existing.code !== validated.code.toUpperCase()) {
    const duplicateCode = await db.machine.findFirst({
      where: { code: validated.code.toUpperCase() },
    });
    if (duplicateCode && duplicateCode.id !== id && !duplicateCode.deletedAt) {
      throw new Error(`Machine code "${validated.code}" is already in use.`);
    }
  }

  if (existing.name !== validated.name.trim()) {
    const duplicateName = await db.machine.findFirst({
      where: { name: validated.name.trim() },
    });
    if (duplicateName && duplicateName.id !== id && !duplicateName.deletedAt) {
      throw new Error(`Machine name "${validated.name}" is already in use.`);
    }
  }

  await releaseDeletedNameAndCode(validated.code.trim().toUpperCase(), validated.name.trim(), id);

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
        trimMode: validated.trimMode,
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
  revalidateTag(LOOKUP_TAGS.machines);
  return updated;
}

async function deleteMachineImpl(id: string) {
  const { userId } = await requireRole(Role.ADMIN);

  const existing = await db.machine.findFirst({
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
  revalidateTag(LOOKUP_TAGS.machines);
  return deleted;
}

// Public actions: never throw for expected failures (see MachineActionResult).

export async function createMachine(data: MachineFormInput): Promise<MachineActionResult> {
  try {
    await createMachineImpl(data);
    return { success: true };
  } catch (err) {
    return { success: false, error: friendlyError(err) };
  }
}

export async function updateMachine(
  id: string,
  data: MachineFormInput
): Promise<MachineActionResult> {
  try {
    await updateMachineImpl(id, data);
    return { success: true };
  } catch (err) {
    return { success: false, error: friendlyError(err) };
  }
}

export async function deleteMachine(id: string): Promise<MachineActionResult> {
  try {
    await deleteMachineImpl(id);
    return { success: true };
  } catch (err) {
    return { success: false, error: friendlyError(err) };
  }
}
