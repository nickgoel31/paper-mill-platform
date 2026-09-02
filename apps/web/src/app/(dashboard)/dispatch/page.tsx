import { requireRole } from "@/server/auth-helpers";
import { Role } from "@prisma/client";
import { getPendingDispatchLoadBatches } from "@/server/services/dispatch-service";
import { ReadyDispatchList } from "@/components/dispatch/ready-dispatch-list";

export const metadata = {
  title: "Dispatch Desk | PaperMill ERP",
};

export default async function DispatchPage() {
  await requireRole(Role.ADMIN, Role.DISPATCH, Role.PLANNER, Role.SALES);

  const batches = await getPendingDispatchLoadBatches();

  return <ReadyDispatchList batches={JSON.parse(JSON.stringify(batches))} />;
}
