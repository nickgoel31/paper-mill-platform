import { requireRole } from "@/server/auth-helpers";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import {
  getProductionRuns,
  getProductionSummaryStats,
} from "@/server/services/production-service";
import { ProductionRunList } from "@/components/production/run-list";

export const metadata = {
  title: "Production Runs | PaperMill ERP",
};

export default async function ProductionRunsPage() {
  const { role } = await requireRole(
    Role.ADMIN,
    Role.PLANNER,
    Role.OPERATOR,
    Role.SALES,
    Role.DISPATCH
  );

  const [initialData, stats, machines] = await Promise.all([
    getProductionRuns({ page: 1, pageSize: 20 }),
    getProductionSummaryStats(),
    db.machine.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
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
