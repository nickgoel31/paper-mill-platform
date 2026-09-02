import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import { db } from "@/lib/db";
import {
  getWastageLogs,
  getWastageAnalytics,
} from "@/server/services/wastage-service";
import { WastagePageContainer } from "@/components/wastage/wastage-page-container";

export const metadata = {
  title: "Trim & Wastage Analytics | PaperMill ERP",
};

export default async function WastagePage() {
  const { role } = await requireRole(
    Role.ADMIN,
    Role.PLANNER,
    Role.DISPATCH,
    Role.SALES,
    Role.OPERATOR
  );

  const [initialLogs, analytics, machines, runs] = await Promise.all([
    getWastageLogs({ page: 1, pageSize: 20 }),
    getWastageAnalytics(30),
    db.machine.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    db.productionRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, runNumber: true },
    }),
  ]);

  return (
    <WastagePageContainer
      initialLogs={JSON.parse(JSON.stringify(initialLogs))}
      initialAnalytics={analytics}
      machinesList={machines}
      productionRunsList={runs}
      userRole={role}
    />
  );
}
