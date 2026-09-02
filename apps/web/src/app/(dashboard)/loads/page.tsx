import { auth } from "@/lib/auth";
import { getLoadBatches } from "@/server/services/load-batch-service";
import { LoadList } from "@/components/loads/load-list";
import { Role } from "@/generated/prisma/browser";
import { db } from "@/lib/db";

export const metadata = {
  title: "Load Planning | PaperMill ERP",
};

export default async function LoadsPage() {
  const session = await auth();
  const userRole = ((session?.user as any)?.role as Role) || Role.SALES;

  const [batchesRes, trucks, transporters] = await Promise.all([
    getLoadBatches({ page: 1, pageSize: 20 }),
    db.truck.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, registrationNumber: true, capacityKg: true },
      orderBy: { registrationNumber: "asc" },
    }),
    db.transporter.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Truck & Load Batch Planning</h1>
          <p className="text-sm text-muted-foreground">
            Group multiple customer orders travelling along the same route into consolidated truck batches.
          </p>
        </div>
      </div>

      <LoadList
        initialData={JSON.parse(JSON.stringify(batchesRes))}
        trucksList={trucks}
        transportersList={transporters}
        userRole={userRole}
      />
    </div>
  );
}
