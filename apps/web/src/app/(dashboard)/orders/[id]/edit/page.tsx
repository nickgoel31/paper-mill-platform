import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/server/auth-helpers";
import { Role, OrderStatus } from "@/generated/prisma/browser";
import { getOrderById, getActiveMachineConstraints } from "@/server/services/order-service";
import { getClientOptions } from "@/server/services/lookup-service";
import { getSystemSettings } from "@/server/services/settings-service";
import { getGsmWeightMap } from "@/server/services/gsm-weight-service";
import { OrderForm } from "@/components/orders/order-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Edit Sales Order | PaperMill ERP",
};

export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { tenantId } = await requireRole(Role.ADMIN, Role.SALES);
  const { id } = await params;

  const [order, clients, machineConstraints, settings, gsmWeightMap] = await Promise.all([
    getOrderById(id),
    getClientOptions(tenantId!),
    getActiveMachineConstraints(tenantId!),
    getSystemSettings(),
    getGsmWeightMap(),
  ]);

  if (!order) {
    notFound();
  }

  // Domain Rule: An order cannot be edited once it is PLANNED or later
  if (
    order.status !== OrderStatus.DRAFT &&
    order.status !== OrderStatus.CONFIRMED
  ) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 py-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="text-sm font-bold">Order Cannot Be Edited</AlertTitle>
          <AlertDescription className="text-xs mt-1">
            Order <strong>#{order.orderNumber}</strong> is currently in status &ldquo;{order.status}&rdquo;.
            It has already been assigned to load batches or production runs.
            To modify quantities or specifications, please cancel this order and create a new one.
          </AlertDescription>
        </Alert>

        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/orders/${order.id}`}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Order #{order.orderNumber}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/orders">Go to Orders List</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <OrderForm
      initialOrder={JSON.parse(JSON.stringify(order))}
      clients={clients}
      defaultUnit={settings.measurementUnit}
      machineConstraints={machineConstraints}
      gsmWeightMap={gsmWeightMap}
    />
  );
}
