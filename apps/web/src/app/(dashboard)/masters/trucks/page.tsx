import { auth } from "@/lib/auth";
import { getTrucks, getTransporters } from "@/server/services/truck-service";
import { TrucksManager } from "@/components/masters/trucks-manager";
import { Role } from "@/generated/prisma/browser";
import { db } from "@/lib/db";

export const metadata = {
  title: "Trucks & Transporters | PaperMill ERP",
};

export default async function TrucksMasterPage() {
  const session = await auth();
  const userRole = (session?.user as any)?.role as Role;
  const isAdmin = userRole === Role.ADMIN;

  const [trucksRes, transportersRes, allTransporters] = await Promise.all([
    getTrucks({ page: 1, pageSize: 20 }),
    getTransporters({ page: 1, pageSize: 20 }),
    db.transporter.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6 font-sans pb-10">
      <div className="bg-white rounded-[26px] p-6 sm:p-7 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-[11px] font-bold uppercase tracking-wide">
            LOGISTICS INFRASTRUCTURE • FLEET & CARRIERS
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Fleet & Transport Master
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl font-medium">
            Manage transport partners and vehicle payloads for truck load batching.
          </p>
        </div>
      </div>

      <TrucksManager
        initialTransporters={JSON.parse(JSON.stringify(transportersRes))}
        initialTrucks={JSON.parse(JSON.stringify(trucksRes))}
        transportersList={allTransporters}
        isAdmin={isAdmin}
      />
    </div>
  );
}
