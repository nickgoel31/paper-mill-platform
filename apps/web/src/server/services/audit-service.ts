"use server";

import { db } from "@/lib/db";
import { Prisma, Role } from "@/generated/prisma/browser";
import { requireRole } from "@/server/auth-helpers";

export interface LogAuditParams {
  userId?: string | null;
  entityType: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "RESTORE" | "RESET_PASSWORD" | string;
  before?: any;
  after?: any;
}

export interface AuditLogQueryParams {
  page?: number;
  pageSize?: number;
  entityType?: string;
  action?: string;
  userId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** Distinct entityType values ever logged — for the filter dropdown. */
export async function getAuditLogEntityTypes(): Promise<string[]> {
  await requireRole(Role.ADMIN);
  const rows = await db.auditLog.findMany({
    distinct: ["entityType"],
    select: { entityType: true },
    orderBy: { entityType: "asc" },
  });
  return rows.map((r) => r.entityType);
}

/**
 * Read-only view of every major state-changing event logAudit() has ever
 * recorded (record creates/edits/deletes across orders, stock, invoices,
 * dispatch, machines, users, settings, etc.) — Admin-only, for compliance
 * questions and incident investigation. Nothing here is written by page
 * views or reads; only actual mutations call logAudit().
 */
export async function getAuditLogs(params: AuditLogQueryParams) {
  await requireRole(Role.ADMIN);

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 25));
  const skip = (page - 1) * pageSize;

  const where: Prisma.AuditLogWhereInput = {
    ...(params.entityType ? { entityType: params.entityType } : {}),
    ...(params.action ? { action: params.action } : {}),
    ...(params.userId ? { userId: params.userId } : {}),
    ...(params.search
      ? {
          OR: [
            { entityId: { contains: params.search } },
            { entityType: { contains: params.search } },
            { action: { contains: params.search } },
            { user: { name: { contains: params.search } } },
            { user: { email: { contains: params.search } } },
          ],
        }
      : {}),
    ...(params.dateFrom || params.dateTo
      ? {
          createdAt: {
            ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
            ...(params.dateTo ? { lte: new Date(new Date(params.dateTo).getTime() + 86400000) } : {}),
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    }),
  ]);

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function logAudit(
  params: LogAuditParams,
  tx?: Prisma.TransactionClient
) {
  const prismaClient = tx || db;
  try {
    return await prismaClient.auditLog.create({
      data: {
        userId: params.userId,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        before: params.before ? JSON.parse(JSON.stringify(params.before)) : undefined,
        after: params.after ? JSON.parse(JSON.stringify(params.after)) : undefined,
      },
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
    // Don't fail the primary transaction for audit failures unless critical
  }
}
