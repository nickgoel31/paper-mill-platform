import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import {
  getProductionRuns,
  getProductionSummaryStats,
} from "@/server/services/production-service";
import { getMachineOptions } from "@/server/services/lookup-service";
import { ProductionRunList } from "@/components/production/run-list";

export const metadata = {
  title: "Production Runs | PaperMill ERP",
};

export default async function ProductionRunsPage() {
  const { role, tenantId } = await requireRole(
    Role.ADMIN,
    Role.PLANNER,
    Role.OPERATOR,
    Role.SALES,
    Role.DISPATCH
  );

  const [initialData, stats, machines] = await Promise.all([
    getProductionRuns({ page: 1, pageSize: 20 }),
    getProductionSummaryStats(),
    getMachineOptions(tenantId!),
  ]);

  return (
    <ProductionRunList
      initialData={JSON.parse(JSON.stringify(initialData))}
      initialStats={stats}
      machinesList={machines}
      userRole={role}
    />
  );
}
