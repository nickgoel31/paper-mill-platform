import { auth } from "@/lib/auth";
import { getOrders, getOrderSummaryStats } from "@/server/services/order-service";
import { OrderList } from "@/components/orders/order-list";
import { Role } from "@/generated/prisma/browser";
import { db } from "@/lib/db";

export const metadata = {
  title: "Sales Orders | PaperMill ERP",
};

export default async function OrdersPage() {
  const session = await auth();
  const userRole = ((session?.user as any)?.role as Role) || Role.SALES;

  const [ordersRes, stats, clients] = await Promise.all([
    getOrders({ page: 1, pageSize: 20 }),
    getOrderSummaryStats(),
    db.client.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales Orders Management</h1>
          <p className="text-sm text-muted-foreground">
            Customer reel orders with width specifications, GSM, tolerance bands, and production fulfillment tracking.
          </p>
        </div>
      </div>

      <OrderList
        initialData={JSON.parse(JSON.stringify(ordersRes))}
        initialStats={stats}
        clientsList={clients}
        userRole={userRole}
      />
    </div>
  );
}
