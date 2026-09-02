import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import {
  getStockItems,
  getStockSummaryStats,
} from "@/server/services/stock-service";
import { StockList } from "@/components/stock/stock-list";

export const metadata = {
  title: "Stock & Reel Inventory | PaperMill ERP",
};

export default async function StockPage() {
  const { role } = await requireRole(
    Role.ADMIN,
    Role.PLANNER,
    Role.DISPATCH,
    Role.SALES,
    Role.OPERATOR
  );

  const [initialData, stats] = await Promise.all([
    getStockItems({ page: 1, pageSize: 20 }),
    getStockSummaryStats(),
  ]);

  return (
    <StockList
      initialData={JSON.parse(JSON.stringify(initialData))}
      initialStats={stats}
      userRole={role}
    />
  );
}
