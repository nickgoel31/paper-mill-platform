import { requireRole } from "@/server/auth-helpers";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { getPendingDemandItems } from "@/server/services/deckle-service";
import { DecklePlanningWorkspace } from "@/components/deckle/deckle-planning-workspace";

export const metadata = {
  title: "Deckle Planning & Optimization | PaperMill ERP",
};

export default async function DecklePlanningPage() {
  const { role } = await requireRole(Role.ADMIN, Role.PLANNER);

  const [demandItems, machines] = await Promise.all([
    getPendingDemandItems(),
    db.machine.findMany({
      where: { deletedAt: null, isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        maxDeckleInch: true,
        minDeckleInch: true,
        minTrimInch: true,
        maxTrimInch: true,
        minGsm: true,
        maxGsm: true,
      },
      orderBy: { maxDeckleInch: "desc" },
    }),
  ]);

  const formattedMachines = machines.map((m) => ({
    id: m.id,
    name: m.name,
    code: m.code,
    maxDeckleInch: Number(m.maxDeckleInch),
    minDeckleInch: Number(m.minDeckleInch),
    minTrimInch: Number(m.minTrimInch),
    maxTrimInch: Number(m.maxTrimInch),
    minGsm: m.minGsm,
    maxGsm: m.maxGsm,
  }));

  return (
    <DecklePlanningWorkspace
      demandItems={JSON.parse(JSON.stringify(demandItems))}
      machines={formattedMachines}
      userRole={role}
    />
  );
}
