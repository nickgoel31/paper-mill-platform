import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import { getDashboardData } from "@/server/services/dashboard-service";
import { ExecutiveDashboardView } from "@/components/dashboard/executive-dashboard-view.lazy";

export const metadata = {
  title: "Executive Dashboard | PaperMill ERP",
};

export default async function DashboardPage() {
  const { role, tenantId } = await requireRole(
    Role.ADMIN,
    Role.PLANNER,
    Role.SALES,
    Role.DISPATCH,
    Role.OPERATOR
  );

  let resolvedTenantId = tenantId;
  if (!resolvedTenantId) {
    const { db } = await import("@/lib/db");
    const activeTenant = await db.tenant.findFirst({ where: { isActive: true } });
    resolvedTenantId = activeTenant?.id || null;
  }

  const data = resolvedTenantId ? await getDashboardData(resolvedTenantId, 30) : null;

  return (
    <ExecutiveDashboardView
      data={data ? JSON.parse(JSON.stringify(data)) : ({} as any)}
      userRole={role}
    />
  );
}
