import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import { getGsmWeightProfiles } from "@/server/services/gsm-weight-service";
import { GsmWeightProfilesManager } from "@/components/masters/gsm-weight-profiles-manager";

export const metadata = {
  title: "GSM Weight Chart | PaperMill ERP",
};

export default async function GsmWeightsMasterPage() {
  const { role } = await requireRole(Role.ADMIN, Role.PLANNER, Role.SALES, Role.OPERATOR, Role.DISPATCH);
  const canManage = role === Role.ADMIN || role === Role.PLANNER;

  const rows = await getGsmWeightProfiles();

  return (
    <GsmWeightProfilesManager initialData={JSON.parse(JSON.stringify(rows))} canManage={canManage} />
  );
}
