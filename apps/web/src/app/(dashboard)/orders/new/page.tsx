import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import { getActiveMachineConstraints } from "@/server/services/order-service";
import { getClientOptions } from "@/server/services/lookup-service";
import { getSystemSettings } from "@/server/services/settings-service";
import { getGsmWeightMap } from "@/server/services/gsm-weight-service";
import { OrderForm } from "@/components/orders/order-form";

export const metadata = {
  title: "New Sales Order | PaperMill ERP",
};

export default async function NewOrderPage() {
  const { tenantId } = await requireRole(Role.ADMIN, Role.SALES);

  const [clients, machineConstraints, settings, gsmWeightMap] = await Promise.all([
    getClientOptions(tenantId!),
    getActiveMachineConstraints(tenantId!),
    getSystemSettings(),
    getGsmWeightMap(),
  ]);

  return (
    <OrderForm
      clients={clients}
      defaultUnit={settings.measurementUnit}
      machineConstraints={machineConstraints}
      gsmWeightMap={gsmWeightMap}
    />
  );
}
