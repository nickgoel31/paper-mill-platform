import { requireRole } from "@/server/auth-helpers";
import { Role } from "@prisma/client";
import { getDispatchHistory } from "@/server/services/dispatch-service";
import { DispatchHistoryList } from "@/components/dispatch/dispatch-history-list";

export const metadata = {
  title: "Dispatch History & Gate Passes | PaperMill ERP",
};

export default async function DispatchHistoryPage() {
  await requireRole(Role.ADMIN, Role.DISPATCH, Role.PLANNER, Role.SALES);

  const initialData = await getDispatchHistory({ page: 1, pageSize: 20 });

  return (
    <DispatchHistoryList
      initialData={JSON.parse(JSON.stringify(initialData))}
    />
  );
}
