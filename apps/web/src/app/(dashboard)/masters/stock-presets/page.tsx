import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import { getStockPresets } from "@/server/services/stock-preset-service";
import { StockPresetsManager } from "@/components/masters/stock-presets-manager";

export const metadata = {
  title: "Stock Presets Master | PaperMill ERP",
};

export default async function StockPresetsMasterPage() {
  const { role } = await requireRole(
    Role.ADMIN,
    Role.PLANNER,
    Role.SALES,
    Role.OPERATOR,
    Role.DISPATCH
  );
  const isAdmin = role === Role.ADMIN || role === Role.PLANNER;

  const initialData = await getStockPresets({ page: 1, pageSize: 20 });

  return (
    <StockPresetsManager
      initialData={JSON.parse(JSON.stringify(initialData))}
      isAdmin={isAdmin}
    />
  );
}
