import { requireRole } from "@/server/auth-helpers";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { getActiveMachineConstraints } from "@/server/services/order-service";
import { OrderForm } from "@/components/orders/order-form";

export const metadata = {
  title: "New Sales Order | PaperMill ERP",
};

export default async function NewOrderPage() {
  await requireRole(Role.ADMIN, Role.SALES);

  const [clients, machineConstraints] = await Promise.all([
    db.client.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true, code: true, city: true, state: true },
      orderBy: { name: "asc" },
    }),
    getActiveMachineConstraints(),
  ]);

  return (
    <OrderForm
      clients={clients}
      machineConstraints={machineConstraints}
    />
  );
}
