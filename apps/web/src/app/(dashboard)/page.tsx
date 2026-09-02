import { requireRole } from "@/server/auth-helpers";
import { Role } from "@prisma/client";
import { getDashboardData } from "@/server/services/dashboard-service";
import { ExecutiveDashboardView } from "@/components/dashboard/executive-dashboard-view";

export const metadata = {
  title: "Executive Dashboard | PaperMill ERP",
};

export default async function DashboardPage() {
  const { role } = await requireRole(
    Role.ADMIN,
    Role.PLANNER,
    Role.SALES,
    Role.DISPATCH,
    Role.OPERATOR
  );

  const data = await getDashboardData(30);

  return <ExecutiveDashboardView data={JSON.parse(JSON.stringify(data))} userRole={role} />;
}
