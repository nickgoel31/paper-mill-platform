import { requireRole } from "@/server/auth-helpers";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { getOperatorMachineQueue } from "@/server/services/production-service";
import { MachineQueueScreen } from "@/components/operator/machine-queue-screen";

interface OperatorQueuePageProps {
  searchParams: Promise<{ machineId?: string }>;
}

export default async function OperatorQueuePage({ searchParams }: OperatorQueuePageProps) {
  await requireRole(Role.OPERATOR, Role.ADMIN, Role.PLANNER);

  const { machineId } = await searchParams;

  const machines = await db.machine.findMany({
    where: { deletedAt: null, isActive: true },
    select: {
      id: true,
      name: true,
      code: true,
      maxDeckleInch: true,
    },
    orderBy: { name: "asc" },
  });

  const selectedMachineId = machineId || (machines.length > 0 ? machines[0].id : "");

  const { runningRun, releasedRuns } = selectedMachineId
    ? await getOperatorMachineQueue(selectedMachineId)
    : { runningRun: null, releasedRuns: [] };

  const formattedMachines = machines.map((m) => ({
    id: m.id,
    name: m.name,
    code: m.code,
    maxDeckleInch: Number(m.maxDeckleInch),
  }));

  return (
    <MachineQueueScreen
      machines={formattedMachines}
      initialMachineId={selectedMachineId}
      runningRun={runningRun ? JSON.parse(JSON.stringify(runningRun)) : null}
      releasedRuns={JSON.parse(JSON.stringify(releasedRuns))}
    />
  );
}
