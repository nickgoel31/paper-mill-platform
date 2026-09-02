"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role, Prisma } from "@prisma/client";
import { logAudit } from "./audit-service";
import bcrypt from "bcryptjs";
import {
  QueryParams,
  parsePaginationParams,
  buildPaginatedResponse,
} from "./base-service";
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  CreateUserInput,
  UpdateUserInput,
  ResetPasswordInput,
} from "@/lib/schemas/user";
import { revalidatePath } from "next/cache";

export async function getUsers(params: QueryParams) {
  // Only ADMIN can access user list
  await requireRole(Role.ADMIN);

  const { skip, take, search, sortBy, sortOrder } = parsePaginationParams(params);

  const where: Prisma.UserWhereInput = {
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy === "createdAt" ? "createdAt" : sortBy]: sortOrder },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // passwordHash is NEVER selected or returned
      },
    }),
  ]);

  return buildPaginatedResponse(rows, total, Math.floor(skip / take) + 1, take);
}

export async function createUser(data: CreateUserInput) {
  const { userId } = await requireRole(Role.ADMIN);
  const validated = createUserSchema.parse(data);

  // Check unique email
  const existing = await db.user.findUnique({
    where: { email: validated.email.toLowerCase().trim() },
  });
  if (existing) {
    throw new Error(`User with email "${validated.email}" already exists.`);
  }

  const passwordHash = await bcrypt.hash(validated.password, 10);

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: validated.name.trim(),
        email: validated.email.toLowerCase().trim(),
        passwordHash,
        role: validated.role,
        isActive: validated.isActive,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await logAudit(
      {
        userId,
        entityType: "User",
        entityId: created.id,
        action: "CREATE",
        after: created,
      },
      tx
    );

    return created;
  });

  revalidatePath("/users");
  revalidatePath("/masters/users");
  return user;
}

export async function updateUser(id: string, data: UpdateUserInput) {
  const { userId } = await requireRole(Role.ADMIN);
  const validated = updateUserSchema.parse(data);

  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) {
    throw new Error("User not found.");
  }

  // Cross-cutting Rule: An admin cannot deactivate or demote their own account
  if (id === userId) {
    if (!validated.isActive) {
      throw new Error("You cannot deactivate your own admin account.");
    }
    if (validated.role !== Role.ADMIN) {
      throw new Error("You cannot demote your own account from the ADMIN role.");
    }
  }

  // Check email uniqueness if changed
  if (existing.email !== validated.email.toLowerCase().trim()) {
    const duplicate = await db.user.findUnique({
      where: { email: validated.email.toLowerCase().trim() },
    });
    if (duplicate && duplicate.id !== id) {
      throw new Error(`Email "${validated.email}" is already registered.`);
    }
  }

  const updated = await db.$transaction(async (tx) => {
    const res = await tx.user.update({
      where: { id },
      data: {
        name: validated.name.trim(),
        email: validated.email.toLowerCase().trim(),
        role: validated.role,
        isActive: validated.isActive,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    await logAudit(
      {
        userId,
        entityType: "User",
        entityId: id,
        action: "UPDATE",
        before: { name: existing.name, email: existing.email, role: existing.role, isActive: existing.isActive },
        after: res,
      },
      tx
    );

    return res;
  });

  revalidatePath("/users");
  revalidatePath("/masters/users");
  return updated;
}

export async function resetUserPassword(data: ResetPasswordInput) {
  const { userId } = await requireRole(Role.ADMIN);
  const validated = resetPasswordSchema.parse(data);

  const existing = await db.user.findUnique({ where: { id: validated.userId } });
  if (!existing) {
    throw new Error("User not found.");
  }

  const newHash = await bcrypt.hash(validated.newPassword, 10);

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: validated.userId },
      data: { passwordHash: newHash },
    });

    await logAudit(
      {
        userId,
        entityType: "User",
        entityId: validated.userId,
        action: "RESET_PASSWORD",
        after: { targetUser: existing.email },
      },
      tx
    );
  });

  revalidatePath("/users");
  revalidatePath("/masters/users");
  return { success: true };
}
