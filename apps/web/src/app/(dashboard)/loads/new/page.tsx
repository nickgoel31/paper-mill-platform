import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import { getUnassignedConfirmedOrders } from "@/server/services/load-batch-service";
import { getTruckOptions, getTransporterOptions } from "@/server/services/lookup-service";
import { LoadBuilder } from "@/components/loads/load-builder";

export const metadata = {
  title: "Build Load Batch | PaperMill ERP",
};

export default async function NewLoadBatchPage() {
  await requireRole(Role.ADMIN, Role.PLANNER, Role.SALES);

  const [unassignedOrders, trucks, transporters] = await Promise.all([
    getUnassignedConfirmedOrders(),
    getTruckOptions(),
    getTransporterOptions(),
  ]);

  return (
    <LoadBuilder
      unassignedOrders={JSON.parse(JSON.stringify(unassignedOrders))}
      trucks={trucks}
      transporters={transporters}
    />
  );
}
