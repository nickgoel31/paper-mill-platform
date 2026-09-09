import { notFound } from "next/navigation";
import { getTenant } from "@/server/services/platform-service";
import { MillDetailView } from "@/components/platform/mill-detail-view";

export const metadata = { title: "Mill | Platform" };

export default async function MillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getTenant(id);
  if (!data) notFound();

  return (
    <MillDetailView
      tenant={JSON.parse(JSON.stringify(data.tenant))}
      users={JSON.parse(JSON.stringify(data.users))}
    />
  );
}
