import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth-helpers";
import { Role } from "@prisma/client";
import { getProductionRunById } from "@/server/services/production-service";
import { ActiveRunScreen } from "@/components/operator/active-run-screen";

interface OperatorActiveRunPageProps {
  params: Promise<{ id: string }>;
}

export default async function OperatorActiveRunPage({
  params,
}: OperatorActiveRunPageProps) {
  await requireRole(Role.OPERATOR, Role.ADMIN, Role.PLANNER);

  const { id } = await params;
  const run = await getProductionRunById(id);

  if (!run) notFound();

  return <ActiveRunScreen run={JSON.parse(JSON.stringify(run))} />;
}
