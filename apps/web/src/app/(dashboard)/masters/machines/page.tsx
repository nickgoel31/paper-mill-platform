import { auth } from "@/lib/auth";
import { getMachines } from "@/server/services/machine-service";
import { MachinesManager } from "@/components/masters/machines-manager";
import { Role } from "@/generated/prisma/browser";

export const metadata = {
  title: "Machine Master | PaperMill ERP",
};

export default async function MachinesMasterPage() {
  const session = await auth();
  const userRole = (session?.user as any)?.role as Role;
  const isAdmin = userRole === Role.ADMIN;

  const initialData = await getMachines({ page: 1, pageSize: 20 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Machine Master & Deckles</h1>
          <p className="text-sm text-muted-foreground">
            Configure machine deckle widths, trim limits, and speeds. Enforce RULE B: All machine parameters are dynamic database records.
          </p>
        </div>
      </div>

      <MachinesManager
        initialData={JSON.parse(JSON.stringify(initialData))}
        isAdmin={isAdmin}
      />
    </div>
  );
}
