import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import { getFloorRuns } from "@/server/services/production-service";
import { FloorRunsScreen } from "@/components/operator/floor-runs-screen";

/** Floor tablet: every run deployed to the floor, with Start / Complete. */
export default async function OperatorPage() {
  await requireRole(Role.OPERATOR, Role.ADMIN, Role.PLANNER);

  const runs = await getFloorRuns();

  return <FloorRunsScreen runs={JSON.parse(JSON.stringify(runs))} />;
}
