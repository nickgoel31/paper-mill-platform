import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import { getPendingDemandItems, getStockMatchesForPendingDemand } from "@/server/services/deckle-service";
import { getMachineOptions } from "@/server/services/lookup-service";
import { DecklePlanningWorkspace } from "@/components/deckle/deckle-planning-workspace";

export const metadata = {
  title: "Deckle Planning & Optimization | PaperMill ERP",
};

export default async function DecklePlanningPage() {
  const { role, tenantId } = await requireRole(Role.ADMIN, Role.PLANNER);

  const [demandItems, machineOptions, stockMatches] = await Promise.all([
    getPendingDemandItems(),
    getMachineOptions(tenantId!),
    getStockMatchesForPendingDemand(),
  ]);

  const formattedMachines = [...machineOptions]
    .sort((a, b) => b.maxDeckleInch - a.maxDeckleInch)
    .map((m) => ({
      id: m.id,
      name: m.name,
      code: m.code,
      maxDeckleInch: m.maxDeckleInch,
      minDeckleInch: m.minDeckleInch,
      minTrimInch: m.minTrimInch,
      maxTrimInch: m.maxTrimInch,
      trimMode: m.trimMode,
      minGsm: m.minGsm,
      maxGsm: m.maxGsm,
    }));

  return (
    <DecklePlanningWorkspace
      demandItems={JSON.parse(JSON.stringify(demandItems))}
      machines={formattedMachines}
      userRole={role}
      stockMatches={JSON.parse(JSON.stringify(stockMatches))}
    />
  );
}
