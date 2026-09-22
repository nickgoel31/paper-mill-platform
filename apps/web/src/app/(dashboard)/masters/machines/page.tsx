import { auth } from "@/lib/auth";
import { getMachines } from "@/server/services/machine-service";
import { getSystemSettings } from "@/server/services/settings-service";
import { MachinesManager } from "@/components/masters/machines-manager";
import { Role } from "@/generated/prisma/browser";

export const metadata = {
  title: "Machine Master | PaperMill ERP",
};

export default async function MachinesMasterPage() {
  const session = await auth();
  const userRole = (session?.user as any)?.role as Role;
  const isAdmin = userRole === Role.ADMIN;

  const [initialData, settings] = await Promise.all([
    getMachines({ page: 1, pageSize: 20 }),
    getSystemSettings(),
  ]);

  return (
    <div className="space-y-6 font-sans pb-10">
      <div className="bg-white rounded-[26px] p-6 sm:p-7 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-[11px] font-bold uppercase tracking-wide">
            FACTORY ASSETS • MACHINE CONFIGURATIONS
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Machine Master & Deckles
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl font-medium">
            Configure machine deckle widths, trim limits, and speeds. Enforce RULE B: All machine parameters are dynamic database records.
          </p>
        </div>
      </div>

      <MachinesManager
        initialData={JSON.parse(JSON.stringify(initialData))}
        isAdmin={isAdmin}
        defaultUnit={settings.measurementUnit}
      />
    </div>
  );
}
