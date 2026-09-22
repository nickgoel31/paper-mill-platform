import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOrderById } from "@/server/services/order-service";
import { getSystemSettings } from "@/server/services/settings-service";
import { OrderDetailView } from "@/components/orders/order-detail-view";
import { Role } from "@/generated/prisma/browser";

export const metadata = {
  title: "Order Details | PaperMill ERP",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userRole = ((session?.user as any)?.role as Role) || Role.SALES;

  const [order, settings] = await Promise.all([getOrderById(id), getSystemSettings()]);

  if (!order) {
    notFound();
  }

  return (
    <OrderDetailView
      order={JSON.parse(JSON.stringify(order))}
      userRole={userRole}
      displayUnit={settings.measurementUnit}
    />
  );
}
