import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLoadBatchById } from "@/server/services/load-batch-service";
import { LoadDetailView } from "@/components/loads/load-detail-view";
import { Role } from "@/generated/prisma/browser";

export const metadata = {
  title: "Load Batch Details | PaperMill ERP",
};

export default async function LoadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userRole = ((session?.user as any)?.role as Role) || Role.SALES;

  const batch = await getLoadBatchById(id);

  if (!batch) {
    notFound();
  }

  return (
    <LoadDetailView
      batch={JSON.parse(JSON.stringify(batch))}
      userRole={userRole}
    />
  );
}
