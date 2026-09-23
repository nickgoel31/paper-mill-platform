import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import { db } from "@/lib/db";
import { getAllActiveStockPresets } from "@/server/services/stock-preset-service";
import { getMachineOptions } from "@/server/services/lookup-service";
import { getSystemSettings } from "@/server/services/settings-service";
import { getGsmWeightMap } from "@/server/services/gsm-weight-service";
import { getWarehouseLocationNames } from "@/server/services/warehouse-location-service";
import { getPaperTypeChoices } from "@/server/services/paper-type-service";
import { StockForm } from "@/components/stock/stock-form";

export const metadata = {
  title: "Inward Stock / Add Reel | PaperMill ERP",
};

export default async function NewStockPage() {
  const { tenantId } = await requireRole(Role.ADMIN, Role.PLANNER, Role.DISPATCH, Role.OPERATOR);

  const [activeMachines, confirmedOrders, stockPresets, settings, gsmWeightMap, locations, paperTypeOptions] = await Promise.all([
    getMachineOptions(tenantId!),
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
            enteredWidth: true,
            enteredWidthUnit: true,
            gsm: true,
            paperType: true,
            size: true,
            bf: true,
            quantityKg: true,
            producedKg: true,
          },
        },
      },
      orderBy: { orderNumber: "desc" },
      take: 50,
    }),
    getAllActiveStockPresets(),
    getSystemSettings(),
    getGsmWeightMap(),
    getWarehouseLocationNames(),
    getPaperTypeChoices(),
  ]);

  return (
    <StockForm
      defaultUnit={settings.measurementUnit}
      machines={JSON.parse(JSON.stringify(activeMachines))}
      recentOrders={JSON.parse(JSON.stringify(confirmedOrders))}
      presets={JSON.parse(JSON.stringify(stockPresets))}
      gsmWeightMap={gsmWeightMap}
      locations={locations}
      paperTypeOptions={paperTypeOptions}
    />
  );
}
