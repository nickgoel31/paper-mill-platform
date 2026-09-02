import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth-helpers";
import { Role } from "@prisma/client";
import { getProductionRunById } from "@/server/services/production-service";
import { RunDetailView } from "@/components/production/run-detail-view";

interface ProductionRunDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ProductionRunDetailPageProps) {
  const { id } = await params;
  const run = await getProductionRunById(id);
  return {
    title: run ? `Run #${run.runNumber} | PaperMill ERP` : "Production Run",
  };
}

export default async function ProductionRunDetailPage({
  params,
}: ProductionRunDetailPageProps) {
  const { id } = await params;
  const { role } = await requireRole(
    Role.ADMIN,
    Role.PLANNER,
    Role.OPERATOR,
    Role.SALES,
    Role.DISPATCH
  );

  const run = await getProductionRunById(id);
  if (!run) notFound();

  return (
    <RunDetailView
      run={JSON.parse(JSON.stringify(run))}
      userRole={role}
    />
  );
}
