import { requireRole } from "@/server/auth-helpers";
import { getUsers } from "@/server/services/user-service";
import { UsersManager } from "@/components/masters/users-manager";
import { Role } from "@/generated/prisma/browser";

export const metadata = {
  title: "User Management | PaperMill ERP",
};

export default async function UsersPage() {
  const { user } = await requireRole(Role.ADMIN);
  const initialData = await getUsers({ page: 1, pageSize: 20 });

  return (
    <div className="space-y-6 font-sans pb-10">
      <div className="bg-white rounded-[26px] p-6 sm:p-7 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-[11px] font-bold uppercase tracking-wide">
            SECURITY & ADMINISTRATION • STAFF ACCESS
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Staff & Access Control
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl font-medium">
            Manage factory user accounts, credentials, and role permissions across modules.
          </p>
        </div>
      </div>

      <UsersManager
        initialData={JSON.parse(JSON.stringify(initialData))}
        currentUserId={user.id as string}
      />
    </div>
  );
}
