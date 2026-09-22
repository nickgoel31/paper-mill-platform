"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role, NotificationStatus, Prisma } from "@/generated/prisma/browser";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { runWithTenantContext } from "@/lib/tenant-context";
import { logAudit } from "./audit-service";
import {
  QueryParams,
  parsePaginationParams,
  buildPaginatedResponse,
} from "./base-service";
import { revalidatePath } from "next/cache";

export interface NotificationQueryParams extends QueryParams {
  status?: NotificationStatus;
  templateName?: string;
  clientId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function getNotifications(params: NotificationQueryParams) {
  const { skip, take, search, sortBy, sortOrder } = parsePaginationParams(params);

  const where: Prisma.WhatsAppNotificationWhereInput = {
    ...(search
      ? {
          OR: [
            { phoneNumber: { contains: search } },
            { client: { name: { contains: search } } },
            { templateName: { contains: search } },
            { providerMessageId: { contains: search } },
          ],
        }
      : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.templateName ? { templateName: params.templateName } : {}),
    ...(params.clientId ? { clientId: params.clientId } : {}),
    ...(params.dateFrom || params.dateTo
      ? {
          createdAt: {
            ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
            ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.whatsAppNotification.count({ where }),
    db.whatsAppNotification.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy === "createdAt" ? "createdAt" : sortBy]: sortOrder },
      include: {
        client: { select: { id: true, name: true, city: true, phone: true } },
        loadBatch: { select: { id: true, batchNumber: true } },
      },
    }),
  ]);

  return buildPaginatedResponse(rows, total, Math.floor(skip / take) + 1, take);
}

export async function getNotificationSummaryStats() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [sentToday, queuedCount, failedCount, totalSentAllTime] = await Promise.all([
    db.whatsAppNotification.count({
      where: {
        status: NotificationStatus.SENT,
        sentAt: { gte: startOfDay },
      },
    }),
    db.whatsAppNotification.count({
      where: { status: NotificationStatus.QUEUED },
    }),
    db.whatsAppNotification.count({
      where: { status: NotificationStatus.FAILED },
    }),
    db.whatsAppNotification.count({
      where: { status: NotificationStatus.SENT },
    }),
  ]);

  const totalFinished = totalSentAllTime + failedCount;
  const successRate = totalFinished > 0 ? (totalSentAllTime / totalFinished) * 100 : 100;

  return {
    sentToday,
    queuedCount,
    failedCount,
    successRate: Number(successRate.toFixed(1)),
  };
}

// -----------------------------------------------------------------------------
// QUEUE PROCESSOR WITH RETRY BACKOFF & RATE LIMITING
// -----------------------------------------------------------------------------

/**
 * Cron entry: drains the WhatsApp queue for every active mill. Each mill's batch
 * runs inside its own tenant scope so the isolation layer stays satisfied and
 * one mill's queue can't touch another's.
 */
export async function processNotificationQueue(batchSize: number = 25) {
  const tenants = await db.tenant.findMany({ where: { isActive: true }, select: { id: true } });
  const all = [];
  for (const t of tenants) {
    const res = await runWithTenantContext(
      { tenantId: t.id, isPlatform: false },
      () => processTenantNotificationQueue(batchSize)
    );
    all.push({ tenantId: t.id, ...res });
  }
  return {
    tenants: all.length,
    processedCount: all.reduce((s, r) => s + r.processedCount, 0),
    successCount: all.reduce((s, r) => s + r.successCount, 0),
    failedCount: all.reduce((s, r) => s + r.failedCount, 0),
    details: all.flatMap((r) => r.details),
    perTenant: all,
  };
}

async function getTenantWhatsAppCredentials(tenantId: string | null | undefined) {
  if (!tenantId) return { credentials: null, millName: undefined as string | undefined };
  const tenant = await db.tenant.findFirst({
    where: { id: tenantId },
    select: {
      name: true,
      whatsappEnabled: true,
      whatsappAccessToken: true,
      whatsappPhoneNumberId: true,
      whatsappApiVersion: true,
    },
  });
  if (!tenant || !tenant.whatsappEnabled) return { credentials: null, millName: tenant?.name };
  return {
    credentials: {
      accessToken: tenant.whatsappAccessToken,
      phoneNumberId: tenant.whatsappPhoneNumberId,
      apiVersion: tenant.whatsappApiVersion,
    },
    millName: tenant.name,
  };
}

async function processTenantNotificationQueue(batchSize: number = 25) {
  // 1. Fetch pending queued notifications or failed with attempts < 3
  const pending = await db.whatsAppNotification.findMany({
    where: {
      OR: [
        { status: NotificationStatus.QUEUED },
        { status: NotificationStatus.FAILED, attempts: { lt: 3 } },
      ],
    },
    take: batchSize,
    orderBy: { createdAt: "asc" },
    include: { client: true },
  });

  const results: Array<{ id: string; success: boolean; error?: string; isDryRun: boolean }> = [];

  for (const notif of pending) {
    try {
      // 2. Perform idempotency check inside transaction
      const claim = await db.whatsAppNotification.findFirst({
        where: { id: notif.id },
      });

      if (!claim || claim.status === NotificationStatus.SENT) {
        continue; // Already processed
      }

      // 3. Send message using this mill's own WhatsApp Cloud API credentials, if configured
      const { credentials, millName } = await getTenantWhatsAppCredentials(notif.tenantId);
      const res = await sendWhatsAppMessage({
        phoneNumber: notif.phoneNumber,
        templateName: notif.templateName,
        payload: (notif.payload as Record<string, any>) || {},
        credentials,
        millName,
      });

      if (res.success) {
        await db.whatsAppNotification.update({
          where: { id: notif.id },
          data: {
            status: NotificationStatus.SENT,
            sentAt: new Date(),
            providerMessageId: res.providerMessageId,
            errorMessage: null,
            attempts: notif.attempts + 1,
          },
        });
        results.push({ id: notif.id, success: true, isDryRun: res.isDryRun });
      } else {
        const nextAttempts = notif.attempts + 1;
        await db.whatsAppNotification.update({
          where: { id: notif.id },
          data: {
            status: nextAttempts >= 3 ? NotificationStatus.FAILED : NotificationStatus.QUEUED,
            attempts: nextAttempts,
            errorMessage: res.error || "Sending failed",
          },
        });
        results.push({ id: notif.id, success: false, error: res.error, isDryRun: res.isDryRun });
      }

      // Small delay (50ms) to respect rate limits
      await new Promise((r) => setTimeout(r, 50));
    } catch (err: any) {
      await db.whatsAppNotification.update({
        where: { id: notif.id },
        data: {
          status: notif.attempts + 1 >= 3 ? NotificationStatus.FAILED : NotificationStatus.QUEUED,
          attempts: notif.attempts + 1,
          errorMessage: err.message || "Unexpected queue processor error",
        },
      });
      results.push({ id: notif.id, success: false, error: err.message, isDryRun: false });
    }
  }

  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  return {
    processedCount: results.length,
    successCount: results.filter((r) => r.success).length,
    failedCount: results.filter((r) => !r.success).length,
    details: results,
  };
}

export async function retryNotification(notificationId: string) {
  const { userId } = await requireRole(Role.ADMIN, Role.DISPATCH);

  const notif = await db.whatsAppNotification.findFirst({
    where: { id: notificationId },
  });

  if (!notif) throw new Error("Notification not found.");

  const { credentials, millName } = await getTenantWhatsAppCredentials(notif.tenantId);
  const res = await sendWhatsAppMessage({
    phoneNumber: notif.phoneNumber,
    templateName: notif.templateName,
    payload: (notif.payload as Record<string, any>) || {},
    credentials,
    millName,
  });

  const updated = await db.whatsAppNotification.update({
    where: { id: notificationId },
    data: {
      status: res.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
      sentAt: res.success ? new Date() : null,
      providerMessageId: res.providerMessageId || notif.providerMessageId,
      errorMessage: res.error || null,
      attempts: notif.attempts + 1,
    },
  });

  await logAudit({
    userId,
    entityType: "WhatsAppNotification",
    entityId: notificationId,
    action: "MANUAL_RETRY",
    after: { success: res.success, error: res.error },
  });

  revalidatePath("/notifications");
  return updated;
}
