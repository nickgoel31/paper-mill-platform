import { auth } from "@/lib/auth";
import { getLoadBatches } from "@/server/services/load-batch-service";
import { getTruckOptions, getTransporterOptions } from "@/server/services/lookup-service";
import { LoadList } from "@/components/loads/load-list";
import { Role } from "@/generated/prisma/browser";

export const metadata = {
  title: "Load Planning | PaperMill ERP",
};

export default async function LoadsPage() {
  const session = await auth();
  const userRole = ((session?.user as any)?.role as Role) || Role.SALES;
  const tenantId = (session?.user as any)?.tenantId as string;

  const [batchesRes, trucks, transporters] = await Promise.all([
    getLoadBatches({ page: 1, pageSize: 20 }),
    getTruckOptions(tenantId),
    getTransporterOptions(tenantId),
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
