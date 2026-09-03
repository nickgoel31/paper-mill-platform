import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import { db } from "@/lib/db";
import { getAllActiveStockPresets } from "@/server/services/stock-preset-service";
import { getMachineOptions } from "@/server/services/lookup-service";
import { StockForm } from "@/components/stock/stock-form";

export const metadata = {
  title: "Inward Stock / Add Reel | PaperMill ERP",
};

export default async function NewStockPage() {
  await requireRole(Role.ADMIN, Role.PLANNER, Role.DISPATCH, Role.OPERATOR);

  const [activeMachines, confirmedOrders, stockPresets] = await Promise.all([
    getMachineOptions(),
    db.order.findMany({
      where: {
        status: { in: ["CONFIRMED", "PLANNED", "IN_PRODUCTION"] },
      },
      select: {
        id: true,
        orderNumber: true,
        client: { select: { name: true, code: true } },
        items: {
          select: {
            id: true,
            widthInch: true,
            gsm: true,
            quantityKg: true,
            producedKg: true,
          },
        },
      },
      orderBy: { orderNumber: "desc" },
      take: 50,
    }),
    getAllActiveStockPresets(),
  ]);

  return (
    <StockForm
      machines={JSON.parse(JSON.stringify(activeMachines))}
      recentOrders={JSON.parse(JSON.stringify(confirmedOrders))}
      presets={JSON.parse(JSON.stringify(stockPresets))}
    />
  );
}
