import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import { db } from "@/lib/db";
import { getUnassignedConfirmedOrders } from "@/server/services/load-batch-service";
import { LoadBuilder } from "@/components/loads/load-builder";

export const metadata = {
  title: "Build Load Batch | PaperMill ERP",
};

export default async function NewLoadBatchPage() {
  await requireRole(Role.ADMIN, Role.PLANNER, Role.SALES);

  const [unassignedOrders, trucks, transporters] = await Promise.all([
    getUnassignedConfirmedOrders(),
    db.truck.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, registrationNumber: true, capacityKg: true, transporterId: true },
      orderBy: { registrationNumber: "asc" },
    }),
    db.transporter.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <LoadBuilder
      unassignedOrders={JSON.parse(JSON.stringify(unassignedOrders))}
      trucks={trucks}
      transporters={transporters}
    />
  );
}
