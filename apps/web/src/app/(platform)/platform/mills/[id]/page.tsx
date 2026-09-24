import { notFound } from "next/navigation";
import { getTenant } from "@/server/services/platform-service";
import { listWhatsAppAllowedSenders } from "@/server/services/whatsapp-allowed-sender-service";
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

  const allowedSenders = await listWhatsAppAllowedSenders(id);

  return (
    <MillDetailView
      tenant={JSON.parse(JSON.stringify(data.tenant))}
      users={JSON.parse(JSON.stringify(data.users))}
      allowedSenders={JSON.parse(JSON.stringify(allowedSenders))}
    />
  );
}
