import { auth } from "@/lib/auth";
import { getClients } from "@/server/services/client-service";
import { ClientsManager } from "@/components/masters/clients-manager";
import { Role } from "@prisma/client";

export const metadata = {
  title: "Client Master | PaperMill ERP",
};

export default async function ClientsMasterPage() {
  const session = await auth();
  const userRole = (session?.user as any)?.role as Role;
  const isAdmin = userRole === Role.ADMIN;

  const initialData = await getClients({ page: 1, pageSize: 20 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Client Directory</h1>
          <p className="text-sm text-muted-foreground">
            Master database of corrugators, box makers, and converters with GSTIN and WhatsApp contacts.
          </p>
        </div>
      </div>

      <ClientsManager
        initialData={JSON.parse(JSON.stringify(initialData))}
        isAdmin={isAdmin}
      />
    </div>
  );
}
