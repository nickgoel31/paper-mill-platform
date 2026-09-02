"use server";

import { db } from "@/lib/db";
import { Role, OrderStatus, RunStatus, LoadStatus, NotificationStatus } from "@prisma/client";

export async function getDashboardData(days: number = 30) {
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  // ---------------------------------------------------------------------------
  // 1. KPI STRIP QUERIES
  // ---------------------------------------------------------------------------
  const [
    openOrdersRes,
    ordersDueThisWeekCount,
    overdueOrdersCount,
    runs30d,
    producedThisMonthRes,
    dispatchesThisWeekCount,
    invoicedThisMonthRes,
    failedNotificationsCount,
    overdueBatchesCount,
  ] = await Promise.all([
    // Open orders & pending kg
    db.order.findMany({
      where: {
        status: { in: [OrderStatus.CONFIRMED, OrderStatus.PLANNED, OrderStatus.IN_PRODUCTION] },
      },
      include: { items: { select: { quantityKg: true, producedKg: true } } },
    }),

    // Due this week
    db.order.count({
      where: {
        deliveryDate: { gte: startOfWeek, lte: endOfWeek },
        status: { notIn: [OrderStatus.PRODUCED, OrderStatus.DISPATCHED, OrderStatus.CANCELLED] },
      },
    }),

    // Overdue orders
    db.order.count({
      where: {
        deliveryDate: { lt: startOfToday },
        status: { notIn: [OrderStatus.PRODUCED, OrderStatus.DISPATCHED, OrderStatus.CANCELLED] },
      },
    }),

    // Production runs last 30d (for Hero Trim % & Trend)
    db.productionRun.findMany({
      where: {
        createdAt: { gte: startDate },
        status: { notIn: [RunStatus.CANCELLED] },
      },
      include: {
        machine: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: "asc" },
    }),

    // Total produced kg this month
    db.productionRun.aggregate({
      where: {
        completedAt: { gte: startOfMonth },
        status: RunStatus.COMPLETED,
      },
      _sum: { totalActualKg: true },
    }),

    // Dispatches this week
    db.dispatch.count({
      where: { dispatchedAt: { gte: startOfWeek } },
    }),

    // Invoiced this month
    db.invoice.aggregate({
      where: {
        invoiceDate: { gte: startOfMonth },
        status: { not: "CANCELLED" },
      },
      _sum: { totalAmount: true },
    }),

    // Failed notifications
    db.whatsAppNotification.count({
      where: { status: NotificationStatus.FAILED },
    }),

    // Overdue load batches (planned date passed and not dispatched)
    db.loadBatch.count({
      where: {
        plannedDispatchDate: { lt: startOfToday },
        status: { in: [LoadStatus.PLANNED, LoadStatus.LOADING] },
      },
    }),
  ]);

  // Compute open pending kg
  let totalPendingKg = 0;
  openOrdersRes.forEach((o) => {
    o.items.forEach((it) => {
      const q = Number(it.quantityKg);
      const p = Number(it.producedKg || 0);
      totalPendingKg += Math.max(0, q - p);
    });
  });

  // Compute 30d Average Trim %
  const totalTrimSum = runs30d.reduce((acc, r) => acc + Number(r.totalTrimPercent || 0), 0);
  const avgTrimPercent30d = runs30d.length > 0 ? totalTrimSum / runs30d.length : 1.85;

  const totalProducedKgThisMonth = Number(producedThisMonthRes._sum.totalActualKg || 0);
  const invoicedThisMonth = Number(invoicedThisMonthRes._sum.totalAmount || 0);

  // ---------------------------------------------------------------------------
  // 2. CHARTS DATA AGGREGATION
  // ---------------------------------------------------------------------------

  // Chart 1: Trim % Trend (Daily)
  const dailyTrimMap = new Map<string, { totalTrim: number; count: number }>();
  runs30d.forEach((r) => {
    const dStr = new Date(r.createdAt).toISOString().split("T")[0];
    const prev = dailyTrimMap.get(dStr) || { totalTrim: 0, count: 0 };
    dailyTrimMap.set(dStr, {
      totalTrim: prev.totalTrim + Number(r.totalTrimPercent || 0),
      count: prev.count + 1,
    });
  });

  const trimTrendData = Array.from(dailyTrimMap.entries()).map(([date, d]) => ({
    date: date.slice(5), // MM-DD
    avgTrimPercent: Number((d.totalTrim / d.count).toFixed(2)),
    targetTrim: 3.0,
  }));

  // Chart 2: Production kg by Machine
  const machineProdMap = new Map<string, { name: string; totalKg: number }>();
  runs30d.forEach((r) => {
    const mName = r.machine.name;
    const prev = machineProdMap.get(mName) || { name: mName, totalKg: 0 };
    machineProdMap.set(mName, {
      name: mName,
      totalKg: prev.totalKg + Number(r.totalActualKg || r.totalPlannedKg || 0),
    });
  });

  const productionByMachineData = Array.from(machineProdMap.values()).map((m) => ({
    machine: m.name,
    weightKg: Math.round(m.totalKg),
  }));

  // Chart 3: Order Status Funnel
  const allOrders = await db.order.findMany({
    select: {
      status: true,
      items: { select: { quantityKg: true } },
    },
  });

  const statusMap = new Map<string, { count: number; totalKg: number }>();
  allOrders.forEach((o) => {
    const orderKg = o.items.reduce((acc, it) => acc + Number(it.quantityKg || 0), 0);
    const prev = statusMap.get(o.status) || { count: 0, totalKg: 0 };
    statusMap.set(o.status, {
      count: prev.count + 1,
      totalKg: prev.totalKg + orderKg,
    });
  });

  const orderStatusFunnel = [
    { status: "CONFIRMED", label: "Confirmed", count: statusMap.get(OrderStatus.CONFIRMED)?.count || 0 },
    { status: "PLANNED", label: "Deckle Planned", count: statusMap.get(OrderStatus.PLANNED)?.count || 0 },
    { status: "IN_PRODUCTION", label: "In Production", count: statusMap.get(OrderStatus.IN_PRODUCTION)?.count || 0 },
    { status: "PRODUCED", label: "Produced (Ready)", count: statusMap.get(OrderStatus.PRODUCED)?.count || 0 },
    { status: "DISPATCHED", label: "Dispatched", count: statusMap.get(OrderStatus.DISPATCHED)?.count || 0 },
  ];

  // Chart 4: Top 10 Clients by Dispatched kg
  const dispatchesWithClients = await db.dispatch.findMany({
    where: { dispatchedAt: { gte: startDate } },
    include: {
      loadBatch: {
        include: {
          orders: {
            include: {
              order: {
                select: {
                  client: { select: { name: true } },
                  items: { select: { quantityKg: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const clientKgMap = new Map<string, number>();
  dispatchesWithClients.forEach((d) => {
    d.loadBatch.orders.forEach((lo) => {
      const cName = lo.order.client.name;
      const orderKg = lo.order.items.reduce((acc, it) => acc + Number(it.quantityKg || 0), 0);
      clientKgMap.set(cName, (clientKgMap.get(cName) || 0) + orderKg);
    });
  });

  const topClientsData = Array.from(clientKgMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([client, totalKg]) => ({
      client: client.length > 16 ? `${client.slice(0, 14)}...` : client,
      dispatchedKg: Math.round(totalKg),
    }));

  // ---------------------------------------------------------------------------
  // 3. ACTION LISTS ("NEEDS ATTENTION" & "TODAY'S SCHEDULE")
  // ---------------------------------------------------------------------------

  // Overdue Orders list
  const overdueOrdersList = await db.order.findMany({
    where: {
      deliveryDate: { lt: startOfToday },
      status: { notIn: [OrderStatus.PRODUCED, OrderStatus.DISPATCHED, OrderStatus.CANCELLED] },
    },
    take: 5,
    include: { client: { select: { name: true } } },
    orderBy: { deliveryDate: "asc" },
  });

  // High Trim Runs (> 6%)
  const highTrimRuns = runs30d
    .filter((r) => Number(r.totalTrimPercent || 0) > 6.0)
    .slice(0, 5);

  // Today's Scheduled Runs
  const todayRuns = await db.productionRun.findMany({
    where: {
      createdAt: { gte: startOfToday, lte: endOfToday },
    },
    include: { machine: true },
    orderBy: { createdAt: "desc" },
  });

  // Today's Planned Dispatches
  const todayBatches = await db.loadBatch.findMany({
    where: {
      plannedDispatchDate: { gte: startOfToday, lte: endOfToday },
    },
    include: { truck: true },
    orderBy: { plannedDispatchDate: "asc" },
  });

  return {
    kpis: {
      openOrdersCount: openOrdersRes.length,
      pendingKg: totalPendingKg,
      dueThisWeekCount: ordersDueThisWeekCount,
      overdueCount: overdueOrdersCount,
      avgTrimPercent30d: Number(avgTrimPercent30d.toFixed(2)),
      totalProducedKgThisMonth,
      dispatchesThisWeek: dispatchesThisWeekCount,
      invoicedThisMonth,
      failedNotificationsCount,
      overdueBatchesCount,
    },
    charts: {
      trimTrendData,
      productionByMachineData,
      orderStatusFunnel,
      topClientsData,
    },
    actionLists: {
      overdueOrders: overdueOrdersList.map((o) => {
        const dDate = o.deliveryDate ? new Date(o.deliveryDate) : new Date();
        return {
          id: o.id,
          orderNumber: o.orderNumber,
          clientName: o.client.name,
          deliveryDate: dDate.toLocaleDateString("en-IN"),
          daysOverdue: Math.max(
            1,
            Math.floor((Date.now() - dDate.getTime()) / (1000 * 60 * 60 * 24))
          ),
        };
      }),
      highTrimRuns: highTrimRuns.map((r) => ({
        id: r.id,
        runNumber: r.runNumber,
        machineName: r.machine.name,
        gsm: r.gsm,
        trimPercent: Number(r.totalTrimPercent || 0),
      })),
      todayRuns: todayRuns.map((r) => ({
        id: r.id,
        runNumber: r.runNumber,
        machineName: r.machine.name,
        gsm: r.gsm,
        status: r.status,
      })),
      todayBatches: todayBatches.map((b) => ({
        id: b.id,
        batchNumber: b.batchNumber,
        truckNumber: b.truck?.registrationNumber || "Unassigned",
        status: b.status,
      })),
    },
  };
}
