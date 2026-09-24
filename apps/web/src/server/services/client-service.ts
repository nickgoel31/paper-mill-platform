"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role, OrderStatus, Prisma } from "@/generated/prisma/browser";
import { logAudit } from "./audit-service";
import {
  QueryParams,
  parsePaginationParams,
  buildPaginatedResponse,
} from "./base-service";
import { clientSchema, ClientFormInput } from "@/lib/schemas/client";
import { revalidatePath, revalidateTag } from "next/cache";
import { LOOKUP_TAGS } from "./cache-tags";

export async function getClients(params: QueryParams) {
  const { skip, take, search, sortBy, sortOrder } = parsePaginationParams(params);

  const where: Prisma.ClientWhereInput = {
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { code: { contains: search } },
            { city: { contains: search } },
            { state: { contains: search } },
            { phone: { contains: search } },
            { gstin: { contains: search } },
            { contactPerson: { contains: search } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.client.count({ where }),
    db.client.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy === "createdAt" ? "createdAt" : sortBy]: sortOrder },
      include: {
        _count: {
          select: {
            orders: {
              where: { status: { not: OrderStatus.CANCELLED } },
            },
          },
        },
      },
    }),
  ]);

  return buildPaginatedResponse(rows, total, Math.floor(skip / take) + 1, take);
}

/**
 * Errors thrown from a Server Action are redacted to a generic message in
 * production (Next.js strips `.message` for anything not returned as plain
 * data). Catching here and returning `{ error }` instead of throwing is what
 * actually gets a readable message back to the toast.
 */
export async function createClient(data: ClientFormInput) {
  try {
    const { userId } = await requireRole(Role.ADMIN);
    const parsed = clientSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues.map((i) => i.message).join(" ") };
    }
    const validated = parsed.data;

    // Check unique code
    const existing = await db.client.findFirst({
      where: { code: validated.code },
    });
    if (existing) {
      return { error: `Client code "${validated.code}" is already in use.` };
    }

    const client = await db.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          name: validated.name.trim(),
          code: validated.code.trim().toUpperCase(),
          clientType: validated.clientType,
          gstin: validated.gstin || null,
          addressLine1: validated.addressLine1.trim(),
          addressLine2: validated.addressLine2?.trim() || null,
          city: validated.city.trim(),
          state: validated.state,
          pincode: validated.pincode.trim(),
          contactPerson: validated.contactPerson?.trim() || null,
          phone: validated.phone.trim(),
          whatsappNumber: validated.whatsappNumber.trim(),
          email: validated.email?.trim() || null,
          isActive: validated.isActive,
          createdById: userId,
        },
      });

      await logAudit(
        {
          userId,
          entityType: "Client",
          entityId: created.id,
          action: "CREATE",
          after: created,
        },
        tx
      );

      return created;
    });

    revalidatePath("/masters/clients");
    revalidateTag(LOOKUP_TAGS.clients);
    return { client };
  } catch (err: any) {
    return { error: err?.message || "Failed to create client." };
  }
}

export async function updateClient(id: string, data: ClientFormInput) {
  try {
    const { userId } = await requireRole(Role.ADMIN);
    const parsed = clientSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues.map((i) => i.message).join(" ") };
    }
    const validated = parsed.data;

    const existing = await db.client.findFirst({ where: { id } });
    if (!existing || existing.deletedAt) {
      return { error: "Client not found or has been deleted." };
    }

    // Check unique code if changed
    if (existing.code !== validated.code) {
      const duplicate = await db.client.findFirst({
        where: { code: validated.code },
      });
      if (duplicate && duplicate.id !== id) {
        return { error: `Client code "${validated.code}" is already in use.` };
      }
    }

    const updated = await db.$transaction(async (tx) => {
      const res = await tx.client.update({
        where: { id },
        data: {
          name: validated.name.trim(),
          code: validated.code.trim().toUpperCase(),
          clientType: validated.clientType,
          gstin: validated.gstin || null,
          addressLine1: validated.addressLine1.trim(),
          addressLine2: validated.addressLine2?.trim() || null,
          city: validated.city.trim(),
          state: validated.state,
          pincode: validated.pincode.trim(),
          contactPerson: validated.contactPerson?.trim() || null,
          phone: validated.phone.trim(),
          whatsappNumber: validated.whatsappNumber.trim(),
          email: validated.email?.trim() || null,
          isActive: validated.isActive,
        },
      });

      await logAudit(
        {
          userId,
          entityType: "Client",
          entityId: id,
          action: "UPDATE",
          before: existing,
          after: res,
        },
        tx
      );

      return res;
    });

    revalidatePath("/masters/clients");
    revalidateTag(LOOKUP_TAGS.clients);
    return { client: updated };
  } catch (err: any) {
    return { error: err?.message || "Failed to update client." };
  }
}

export async function deleteClient(id: string) {
  const { userId } = await requireRole(Role.ADMIN);

  const existing = await db.client.findFirst({
    where: { id },
    include: {
      orders: {
        where: {
          status: {
            notIn: [OrderStatus.CANCELLED],
          },
        },
        select: { id: true, orderNumber: true, status: true },
      },
    },
  });

  if (!existing || existing.deletedAt) {
    throw new Error("Client not found.");
  }

  // Block delete if client has non-cancelled orders
  if (existing.orders.length > 0) {
    const orderNumbers = existing.orders.map((o) => o.orderNumber).join(", ");
    throw new Error(
      `Cannot delete client "${existing.name}". It has ${existing.orders.length} active/non-cancelled order(s): [${orderNumbers}]. Please cancel or complete them first.`
    );
  }

  const deleted = await db.$transaction(async (tx) => {
    const res = await tx.client.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    await logAudit(
      {
        userId,
        entityType: "Client",
        entityId: id,
        action: "DELETE",
        before: existing,
        after: res,
      },
      tx
    );

    return res;
  });

  revalidatePath("/masters/clients");
  revalidateTag(LOOKUP_TAGS.clients);
  return deleted;
}
