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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff & Access Control</h1>
          <p className="text-sm text-muted-foreground">
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
