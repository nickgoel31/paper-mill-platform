import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth-helpers";
import { Role } from "@prisma/client";
import { getProductionRunById } from "@/server/services/production-service";
import { CompleteRunScreen } from "@/components/operator/complete-run-screen";

interface OperatorCompleteRunPageProps {
  params: Promise<{ id: string }>;
}

export default async function OperatorCompleteRunPage({
  params,
}: OperatorCompleteRunPageProps) {
  await requireRole(Role.OPERATOR, Role.ADMIN, Role.PLANNER);

  const { id } = await params;
  const run = await getProductionRunById(id);

  if (!run) notFound();

  return <CompleteRunScreen run={JSON.parse(JSON.stringify(run))} />;
}
