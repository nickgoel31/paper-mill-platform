import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth-helpers";
import { Role } from "@prisma/client";
import { getLoadBatchLoadingSheetData } from "@/server/services/dispatch-service";
import { LoadingSheetView } from "@/components/dispatch/loading-sheet-view";

export const metadata = {
  title: "Loading Sheet & Gate Pass | PaperMill ERP",
};

export default async function LoadingSheetPage({
  params,
}: {
  params: Promise<{ loadBatchId: string }>;
}) {
  await requireRole(Role.ADMIN, Role.DISPATCH, Role.PLANNER, Role.SALES);

  const { loadBatchId } = await params;
  const batch = await getLoadBatchLoadingSheetData(loadBatchId);

  if (!batch) {
    notFound();
  }

  return <LoadingSheetView batch={JSON.parse(JSON.stringify(batch))} />;
}
