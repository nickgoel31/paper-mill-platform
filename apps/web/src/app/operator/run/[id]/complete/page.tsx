import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import { getProductionRunById } from "@/server/services/production-service";
import { getPostProductionMode } from "@/server/services/tenant-mode-service";
import { CompleteRunScreen } from "@/components/operator/complete-run-screen";

interface OperatorCompleteRunPageProps {
  params: Promise<{ id: string }>;
}

export default async function OperatorCompleteRunPage({
  params,
}: OperatorCompleteRunPageProps) {
  const { tenantId } = await requireRole(Role.OPERATOR, Role.ADMIN, Role.PLANNER);

  const { id } = await params;
  const run = await getProductionRunById(id);

  if (!run) notFound();

  const defaultDestination = await getPostProductionMode(tenantId);

  return (
    <CompleteRunScreen
      run={JSON.parse(JSON.stringify(run))}
      defaultDestination={defaultDestination}
    />
  );
}
