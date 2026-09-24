"use server";

import { db } from "@/lib/db";
import { requirePlatform } from "@/server/auth-helpers";
import { normalizeIndianPhoneNumber } from "@/lib/whatsapp/phone-normalizer";
import { revalidatePath } from "next/cache";

/**
 * Platform-admin CRUD for which WhatsApp numbers may trigger the AI
 * assistant for a mill, and which existing staff user each number acts as.
 * Managed from /platform/mills/[id] — see the webhook at
 * /api/whatsapp/webhook, which looks these rows up by phone number to
 * resolve the tenant and the acting user's real role/permissions.
 */

export async function listWhatsAppAllowedSenders(tenantId: string) {
  await requirePlatform();
  const rows = await db.whatsAppAllowedSender.findMany({
    where: { tenantId },
    include: { actAsUser: { select: { id: true, name: true, role: true, isActive: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows;
}

export async function createWhatsAppAllowedSender(input: {
  tenantId: string;
  phoneNumber: string;
  label?: string;
  actAsUserId: string;
}) {
  try {
    const admin = await requirePlatform();

    let normalized: string;
    try {
      normalized = normalizeIndianPhoneNumber(input.phoneNumber);
    } catch (e: any) {
      return { error: e?.message || "Enter a valid Indian WhatsApp number." };
    }

    const user = await db.user.findFirst({
      where: { id: input.actAsUserId, tenantId: input.tenantId },
    });
    if (!user) {
      return { error: "The selected staff user was not found for this mill." };
    }
    if (!user.isActive) {
      return { error: `"${user.name}" is inactive — activate them first, or pick another staff user.` };
    }

    const existing = await db.whatsAppAllowedSender.findFirst({ where: { phoneNumber: normalized } });
    if (existing) {
      return { error: `+${normalized} is already registered${existing.tenantId !== input.tenantId ? " to a different mill" : ""}.` };
    }

    const created = await db.whatsAppAllowedSender.create({
      data: {
        tenantId: input.tenantId,
        phoneNumber: normalized,
        label: input.label?.trim() || null,
        actAsUserId: input.actAsUserId,
        createdById: admin.id,
      },
    });

    revalidatePath(`/platform/mills/${input.tenantId}`);
    return { sender: created };
  } catch (err: any) {
    return { error: err?.message || "Failed to add WhatsApp number." };
  }
}

export async function setWhatsAppAllowedSenderActive(id: string, isActive: boolean) {
  try {
    await requirePlatform();
    const existing = await db.whatsAppAllowedSender.findFirst({ where: { id } });
    if (!existing) return { error: "Number not found." };

    await db.whatsAppAllowedSender.update({ where: { id }, data: { isActive } });
    revalidatePath(`/platform/mills/${existing.tenantId}`);
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to update number." };
  }
}

export async function deleteWhatsAppAllowedSender(id: string) {
  try {
    await requirePlatform();
    const existing = await db.whatsAppAllowedSender.findFirst({ where: { id } });
    if (!existing) return { error: "Number not found." };

    await db.whatsAppAllowedSender.delete({ where: { id } });
    revalidatePath(`/platform/mills/${existing.tenantId}`);
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to remove number." };
  }
}
