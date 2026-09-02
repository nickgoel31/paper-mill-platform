import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/browser";

export interface LogAuditParams {
  userId?: string | null;
  entityType: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "RESTORE" | "RESET_PASSWORD" | string;
  before?: any;
  after?: any;
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
