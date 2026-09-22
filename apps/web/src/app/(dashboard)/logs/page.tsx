import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import { getAuditLogs, getAuditLogEntityTypes } from "@/server/services/audit-service";
import { AuditLogList } from "@/components/logs/audit-log-list";

export const metadata = {
  title: "Activity Log | PaperMill ERP",
};

export default async function LogsPage() {
  await requireRole(Role.ADMIN);

  const [initialData, entityTypes] = await Promise.all([
    getAuditLogs({ page: 1, pageSize: 25 }),
    getAuditLogEntityTypes(),
  ]);

  return (
    <AuditLogList
      initialData={JSON.parse(JSON.stringify(initialData))}
      entityTypes={entityTypes}
    />
  );
}
