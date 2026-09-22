import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import { getWarehouseLocations } from "@/server/services/warehouse-location-service";
import { WarehouseLocationsManager } from "@/components/masters/warehouse-locations-manager";

export const metadata = {
  title: "Warehouse Locations | PaperMill ERP",
};

export default async function LocationsMasterPage() {
  const { role } = await requireRole(Role.ADMIN, Role.PLANNER, Role.SALES, Role.OPERATOR, Role.DISPATCH);
  const canManage = role === Role.ADMIN || role === Role.PLANNER;

  const rows = await getWarehouseLocations();

  return (
    <WarehouseLocationsManager initialData={JSON.parse(JSON.stringify(rows))} canManage={canManage} />
  );
}
