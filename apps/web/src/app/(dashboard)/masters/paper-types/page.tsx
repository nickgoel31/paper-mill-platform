import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import { getPaperTypeOptions } from "@/server/services/paper-type-service";
import { PaperTypesManager } from "@/components/masters/paper-types-manager";

export const metadata = {
  title: "Paper Types | PaperMill ERP",
};

export default async function PaperTypesMasterPage() {
  const { role } = await requireRole(Role.ADMIN, Role.PLANNER, Role.SALES, Role.OPERATOR, Role.DISPATCH);
  const canManage = role === Role.ADMIN || role === Role.PLANNER;

  const rows = await getPaperTypeOptions();

  return (
    <PaperTypesManager initialData={JSON.parse(JSON.stringify(rows))} canManage={canManage} />
  );
}
