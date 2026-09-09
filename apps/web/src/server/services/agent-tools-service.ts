"use server";

import { db } from "@/lib/db";
import {
  Role,
  OrderStatus,
  OrderPriority,
  RunStatus,
  StockStatus,
  LoadStatus,
  InvoiceStatus,
  Prisma,
} from "@/generated/prisma/browser";
import { revalidatePath, revalidateTag } from "next/cache";
import { DASHBOARD_TAG, LOOKUP_TAGS } from "./cache-tags";
import { getTenantContextSync } from "@/lib/tenant-context";
import { getOrderSummaryStats } from "./order-service";
import { getProductionSummaryStats } from "./production-service";
import { getPendingDemandItems, runSolverOptimization } from "./deckle-service";
import { getPendingDispatchLoadBatches } from "./dispatch-service";
import { getActiveMachineConstraints } from "./order-service";

export interface AgentToolResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
  actionTaken?: string;
}

// -----------------------------------------------------------------------------
// 1. ORDERS CRUD TOOLS
// -----------------------------------------------------------------------------

export async function agentGetOrders(params: {
  search?: string;
  status?: OrderStatus;
  limit?: number;
}) {
  try {
    const orders = await db.order.findMany({
      where: {
        ...(params.status ? { status: params.status } : {}),
        ...(params.search
          ? {
              OR: [
                { orderNumber: { contains: params.search } },
                { client: { name: { contains: params.search } } },
              ],
            }
          : {}),
      },
      include: {
        client: { select: { name: true, code: true, city: true, phone: true } },
        items: true,
      },
      orderBy: { createdAt: "desc" },
      take: params.limit || 10,
    });

    return {
      success: true,
      message: `Found ${orders.length} order(s).`,
      data: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        client: o.client.name,
        city: o.client.city,
        status: o.status,
        priority: o.priority,
        orderDate: o.orderDate,
        deliveryDate: o.deliveryDate,
        totalKg: o.items.reduce((s, i) => s + Number(i.quantityKg), 0),
        items: o.items.map((it) => ({
          id: it.id,
          widthInch: Number(it.widthInch),
          gsm: it.gsm,
          quantityKg: Number(it.quantityKg),
          producedKg: Number(it.producedKg),
          ratePerKg: it.ratePerKg ? Number(it.ratePerKg) : null,
        })),
      })),
    };
  } catch (err: any) {
    return { success: false, message: "Failed to fetch orders", error: err.message };
  }
}

export async function agentCreateOrder(input: {
  clientNameOrCode: string;
  orderNumber?: string;
  priority?: OrderPriority;
  deliveryDate?: string;
  notes?: string;
  items: Array<{
    widthInch: number;
    gsm: number;
    quantityKg: number;
    ratePerKg?: number;
    tolerancePercent?: number;
  }>;
}) {
  try {
    // 1. Resolve client
    let client = await db.client.findFirst({
      where: {
        OR: [
          { name: { contains: input.clientNameOrCode } },
          { code: { contains: input.clientNameOrCode } },
        ],
        deletedAt: null,
      },
    });

    if (!client) {
      const code = input.clientNameOrCode
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 10);
      client = await db.client.create({
        data: {
          name: input.clientNameOrCode,
          code: code || `CL-${Date.now().toString().slice(-4)}`,
          addressLine1: "Industrial Area",
          city: "Delhi",
          state: "Delhi",
          pincode: "110001",
          phone: "9876543210",
          whatsappNumber: "9876543210",
        },
      });
    }

    // 2. Resolve order number
    let orderNum = input.orderNumber;
    if (!orderNum) {
      const yy = String(new Date().getFullYear()).slice(-2);
      const mm = String(new Date().getMonth() + 1).padStart(2, "0");
      const count = await db.order.count();
      orderNum = `SO-${yy}${mm}-${String(count + 1).padStart(4, "0")}`;
    }

    const totalWeight = input.items.reduce((s, it) => s + it.quantityKg, 0);

    const order = await db.order.create({
      data: {
        orderNumber: orderNum,
        clientId: client.id,
        orderDate: new Date(),
        deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
        priority: input.priority || OrderPriority.NORMAL,
        status: OrderStatus.CONFIRMED,
        notes: input.notes || `Created via PaperMill AI Assistant. Total weight: ${totalWeight.toLocaleString("en-IN")} kg.`,
        items: {
          create: input.items.map((it) => ({
            widthInch: new Prisma.Decimal(it.widthInch.toFixed(2)),
            gsm: it.gsm,
            quantityKg: new Prisma.Decimal(it.quantityKg.toFixed(3)),
            ratePerKg: it.ratePerKg ? new Prisma.Decimal(it.ratePerKg.toFixed(2)) : null,
            tolerancePercent: new Prisma.Decimal(it.tolerancePercent || 5.0),
          })),
        },
      },
      include: { client: true, items: true },
    });

    revalidatePath("/orders");
    revalidateTag(DASHBOARD_TAG);
    revalidatePath("/deckle");
    revalidatePath("/");

    return {
      success: true,
      message: `Successfully created Sales Order #${order.orderNumber} with ${order.items.length} sizes totaling ${totalWeight.toLocaleString("en-IN")} kg for ${client.name}.`,
      actionTaken: "CREATE_ORDER",
      data: {
        id: order.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        client: order.client.name,
        city: order.client.city,
        status: order.status,
        priority: order.priority,
        totalKg: totalWeight,
        totalItems: order.items.length,
        totalWeightKg: totalWeight,
        deliveryDate: order.deliveryDate,
        items: order.items.map((it) => ({
          widthInch: Number(it.widthInch),
          gsm: it.gsm,
          quantityKg: Number(it.quantityKg),
          ratePerKg: it.ratePerKg ? Number(it.ratePerKg) : null,
        })),
      },
    };
  } catch (err: any) {
    return { success: false, message: "Failed to create order", error: err.message };
  }
}

export async function agentUpdateOrder(input: {
  orderNumberOrId: string;
  deliveryDate?: string | Date | null;
  priority?: OrderPriority;
  status?: OrderStatus;
  notes?: string;
}) {
  try {
    const order = await db.order.findFirst({
      where: {
        OR: [{ id: input.orderNumberOrId }, { orderNumber: input.orderNumberOrId }],
      },
      include: { client: true, items: true },
    });

    if (!order) {
      return { success: false, message: `Order '${input.orderNumberOrId}' not found.` };
    }

    const updated = await db.order.update({
      where: { id: order.id },
      data: {
        ...(input.deliveryDate !== undefined ? { deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
      },
      include: { client: true, items: true },
    });

    revalidatePath("/orders");
    revalidateTag(DASHBOARD_TAG);
    revalidatePath(`/orders/${order.id}`);

    const totalKg = updated.items.reduce((s, i) => s + Number(i.quantityKg), 0);

    return {
      success: true,
      message: `Updated Sales Order #${updated.orderNumber}: Delivery Date is now ${updated.deliveryDate ? new Date(updated.deliveryDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Unset"}.`,
      actionTaken: "UPDATE_ORDER",
      data: {
        id: updated.id,
        orderNumber: updated.orderNumber,
        client: updated.client.name,
        city: updated.client.city,
        status: updated.status,
        priority: updated.priority,
        deliveryDate: updated.deliveryDate,
        totalKg,
        items: updated.items.map((it) => ({
          widthInch: Number(it.widthInch),
          gsm: it.gsm,
          quantityKg: Number(it.quantityKg),
        })),
      },
    };
  } catch (err: any) {
    return { success: false, message: "Failed to update order", error: err.message };
  }
}

export async function agentUpdateOrderStatus(input: {
  orderNumberOrId: string;
  status: OrderStatus;
}) {
  try {
    const order = await db.order.findFirst({
      where: {
        OR: [{ id: input.orderNumberOrId }, { orderNumber: input.orderNumberOrId }],
      },
    });

    if (!order) {
      return { success: false, message: `Order '${input.orderNumberOrId}' not found.` };
    }

    const updated = await db.order.update({
      where: { id: order.id },
      data: { status: input.status },
    });

    revalidatePath("/orders");
    revalidateTag(DASHBOARD_TAG);
    revalidatePath(`/orders/${order.id}`);

    return {
      success: true,
      message: `Updated status of Order #${order.orderNumber} from ${order.status} to ${input.status}.`,
      actionTaken: "UPDATE_ORDER_STATUS",
      data: updated,
    };
  } catch (err: any) {
    return { success: false, message: "Failed to update order status", error: err.message };
  }
}

export async function agentDeleteOrder(input: { orderNumberOrId: string }) {
  try {
    const order = await db.order.findFirst({
      where: {
        OR: [{ id: input.orderNumberOrId }, { orderNumber: input.orderNumberOrId }],
      },
    });

    if (!order) {
      return { success: false, message: `Order '${input.orderNumberOrId}' not found.` };
    }

    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });

    revalidatePath("/orders");
    revalidateTag(DASHBOARD_TAG);
    revalidatePath("/deckle");

    return {
      success: true,
      message: `Deleted Sales Order #${order.orderNumber} and all its line items.`,
      actionTaken: "DELETE_ORDER",
    };
  } catch (err: any) {
    return { success: false, message: "Failed to delete order", error: err.message };
  }
}

// -----------------------------------------------------------------------------
// 2. CLIENTS CRUD TOOLS
// -----------------------------------------------------------------------------

export async function agentGetClients(params: { search?: string; limit?: number }) {
  try {
    const clients = await db.client.findMany({
      where: {
        deletedAt: null,
        ...(params.search
          ? {
              OR: [
                { name: { contains: params.search } },
                { code: { contains: params.search } },
                { city: { contains: params.search } },
                { gstin: { contains: params.search } },
              ],
            }
          : {}),
      },
      include: {
        _count: { select: { orders: true, invoices: true } },
      },
      take: params.limit || 15,
      orderBy: { name: "asc" },
    });

    return {
      success: true,
      message: `Found ${clients.length} client(s).`,
      data: clients,
    };
  } catch (err: any) {
    return { success: false, message: "Failed to get clients", error: err.message };
  }
}

export async function agentCreateClient(input: {
  name: string;
  code?: string;
  gstin?: string;
  addressLine1: string;
  city: string;
  state: string;
  pincode: string;
  contactPerson?: string;
  phone: string;
  whatsappNumber?: string;
  email?: string;
}) {
  try {
    const code =
      input.code ||
      input.name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 10);

    const client = await db.client.create({
      data: {
        name: input.name,
        code,
        gstin: input.gstin || null,
        addressLine1: input.addressLine1,
        city: input.city,
        state: input.state,
        pincode: input.pincode,
        contactPerson: input.contactPerson || null,
        phone: input.phone,
        whatsappNumber: input.whatsappNumber || input.phone,
        email: input.email || null,
      },
    });

    revalidatePath("/masters/clients");
    revalidateTag(LOOKUP_TAGS.clients);
    return {
      success: true,
      message: `Created client '${client.name}' (${client.code}).`,
      actionTaken: "CREATE_CLIENT",
      data: client,
    };
  } catch (err: any) {
    return { success: false, message: "Failed to create client", error: err.message };
  }
}

export async function agentUpdateClient(input: {
  idOrCode: string;
  name?: string;
  gstin?: string;
  city?: string;
  state?: string;
  phone?: string;
  whatsappNumber?: string;
  email?: string;
}) {
  try {
    const client = await db.client.findFirst({
      where: { OR: [{ id: input.idOrCode }, { code: input.idOrCode }] },
    });
    if (!client) return { success: false, message: `Client '${input.idOrCode}' not found.` };

    const updated = await db.client.update({
      where: { id: client.id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.gstin !== undefined ? { gstin: input.gstin } : {}),
        ...(input.city ? { city: input.city } : {}),
        ...(input.state ? { state: input.state } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.whatsappNumber ? { whatsappNumber: input.whatsappNumber } : {}),
        ...(input.email ? { email: input.email } : {}),
      },
    });

    revalidatePath("/masters/clients");
    revalidateTag(LOOKUP_TAGS.clients);
    return {
      success: true,
      message: `Updated client '${updated.name}' (${updated.code}).`,
      actionTaken: "UPDATE_CLIENT",
      data: updated,
    };
  } catch (err: any) {
    return { success: false, message: "Failed to update client", error: err.message };
  }
}

export async function agentDeleteClient(input: { idOrCode: string }) {
  try {
    const client = await db.client.findFirst({
      where: { OR: [{ id: input.idOrCode }, { code: input.idOrCode }] },
    });
    if (!client) return { success: false, message: `Client '${input.idOrCode}' not found.` };

    await db.client.update({
      where: { id: client.id },
      data: { deletedAt: new Date(), isActive: false },
    });

    revalidatePath("/masters/clients");
    revalidateTag(LOOKUP_TAGS.clients);
    return {
      success: true,
      message: `Deactivated client '${client.name}'.`,
      actionTaken: "DELETE_CLIENT",
    };
  } catch (err: any) {
    return { success: false, message: "Failed to delete client", error: err.message };
  }
}

// -----------------------------------------------------------------------------
// 3. INVENTORY & STOCK ITEMS CRUD TOOLS
// -----------------------------------------------------------------------------

export async function agentGetStockInventory(params: {
  gsm?: number;
  minWidth?: number;
  maxWidth?: number;
  status?: StockStatus;
  limit?: number;
}) {
  try {
    const stock = await db.stockItem.findMany({
      where: {
        ...(params.status ? { status: params.status } : {}),
        ...(params.gsm ? { gsm: params.gsm } : {}),
        ...(params.minWidth || params.maxWidth
          ? {
              widthInch: {
                ...(params.minWidth ? { gte: new Prisma.Decimal(params.minWidth) } : {}),
                ...(params.maxWidth ? { lte: new Prisma.Decimal(params.maxWidth) } : {}),
              },
            }
          : {}),
      },
      include: {
        productionRun: { select: { runNumber: true } },
        orderItem: {
          include: {
            order: { select: { orderNumber: true, client: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: params.limit || 20,
    });

    const totalWeightKg = stock.reduce((s, it) => s + Number(it.quantityKg), 0);

    return {
      success: true,
      message: `Found ${stock.length} warehouse reel(s) totaling ${totalWeightKg.toLocaleString("en-IN")} kg.`,
      data: stock.map((s) => ({
        id: s.id,
        widthInch: Number(s.widthInch),
        gsm: s.gsm,
        quantityKg: Number(s.quantityKg),
        status: s.status,
        location: s.location,
        allocatedOrder: s.orderItem?.order?.orderNumber || null,
        client: s.orderItem?.order?.client?.name || null,
        runNumber: s.productionRun?.runNumber || null,
        createdAt: s.createdAt,
      })),
    };
  } catch (err: any) {
    return { success: false, message: "Failed to query stock inventory", error: err.message };
  }
}

export async function agentCreateStockReel(input: {
  widthInch: number;
  gsm: number;
  quantityKg: number;
  location?: string;
  orderItemId?: string;
}) {
  try {
    const reel = await db.stockItem.create({
      data: {
        widthInch: new Prisma.Decimal(input.widthInch.toFixed(2)),
        gsm: input.gsm,
        quantityKg: new Prisma.Decimal(input.quantityKg.toFixed(3)),
        location: input.location || "BAY-A",
        status: input.orderItemId ? StockStatus.ALLOCATED : StockStatus.AVAILABLE,
        orderItemId: input.orderItemId || null,
      },
    });

    revalidatePath("/inventory");
    return {
      success: true,
      message: `Added reel into stock: ${input.widthInch}" ${input.gsm}GSM (${input.quantityKg} kg) at ${reel.location}.`,
      actionTaken: "CREATE_STOCK_REEL",
      data: reel,
    };
  } catch (err: any) {
    return { success: false, message: "Failed to add stock reel", error: err.message };
  }
}

export async function agentUpdateStockReel(input: {
  id: string;
  location?: string;
  status?: StockStatus;
  quantityKg?: number;
}) {
  try {
    const reel = await db.stockItem.findFirst({ where: { id: input.id } });
    if (!reel) return { success: false, message: `Stock reel '${input.id}' not found.` };

    const updated = await db.stockItem.update({
      where: { id: input.id },
      data: {
        ...(input.location ? { location: input.location } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.quantityKg ? { quantityKg: new Prisma.Decimal(input.quantityKg.toFixed(3)) } : {}),
      },
    });

    revalidatePath("/inventory");
    return {
      success: true,
      message: `Updated reel ${updated.widthInch}" ${updated.gsm}GSM: status ${updated.status}, location ${updated.location}.`,
      actionTaken: "UPDATE_STOCK_REEL",
      data: updated,
    };
  } catch (err: any) {
    return { success: false, message: "Failed to update stock reel", error: err.message };
  }
}

export async function agentDeleteStockReel(input: { id: string }) {
  try {
    await db.stockItem.delete({ where: { id: input.id } });
    revalidatePath("/inventory");
    return { success: true, message: `Deleted stock reel '${input.id}'.`, actionTaken: "DELETE_STOCK_REEL" };
  } catch (err: any) {
    return { success: false, message: "Failed to delete stock reel", error: err.message };
  }
}

// -----------------------------------------------------------------------------
// 4. STOCK PRESETS CRUD TOOLS
// -----------------------------------------------------------------------------

export async function agentGetStockPresets(params?: { gsm?: number; isActive?: boolean }) {
  try {
    const presets = await db.stockPreset.findMany({
      where: {
        deletedAt: null,
        ...(params?.gsm ? { gsm: params.gsm } : {}),
        ...(params?.isActive !== undefined ? { isActive: params.isActive } : {}),
      },
      orderBy: [{ gsm: "asc" }, { widthInch: "asc" }],
    });

    return {
      success: true,
      message: `Found ${presets.length} stock preset(s).`,
      data: presets.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        widthInch: Number(p.widthInch),
        gsm: p.gsm,
        standardWeightKg: Number(p.standardWeightKg),
        defaultLocation: p.defaultLocation,
        shade: p.shade,
        isActive: p.isActive,
      })),
    };
  } catch (err: any) {
    return { success: false, message: "Failed to get stock presets", error: err.message };
  }
}

export async function agentCreateStockPreset(input: {
  name: string;
  code?: string;
  widthInch: number;
  gsm: number;
  standardWeightKg?: number;
  shade?: string;
  bf?: string;
  defaultLocation?: string;
}) {
  try {
    const stdWeight = input.standardWeightKg || input.widthInch * 14.0;
    const code =
      input.code ||
      `PRESET-${input.gsm}-${Math.round(input.widthInch)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    const preset = await db.stockPreset.create({
      data: {
        name: input.name,
        code,
        widthInch: new Prisma.Decimal(input.widthInch.toFixed(2)),
        gsm: input.gsm,
        standardWeightKg: new Prisma.Decimal(stdWeight.toFixed(3)),
        shade: input.shade || "NATURAL",
        bf: input.bf || "18BF",
        defaultLocation: input.defaultLocation || "BAY-A (Primary Warehouse)",
        isActive: true,
      },
    });

    revalidatePath("/masters/stock-presets");
    return {
      success: true,
      message: `Created Stock Preset: '${preset.name}' (${preset.widthInch}" ${preset.gsm}GSM, ${preset.standardWeightKg}kg).`,
      actionTaken: "CREATE_STOCK_PRESET",
      data: preset,
    };
  } catch (err: any) {
    return { success: false, message: "Failed to create stock preset", error: err.message };
  }
}

export async function agentDeleteStockPreset(input: { idOrCode: string }) {
  try {
    const preset = await db.stockPreset.findFirst({
      where: { OR: [{ id: input.idOrCode }, { code: input.idOrCode }] },
    });
    if (!preset) return { success: false, message: `Stock Preset '${input.idOrCode}' not found.` };

    await db.stockPreset.update({
      where: { id: preset.id },
      data: { deletedAt: new Date(), isActive: false },
    });

    revalidatePath("/masters/stock-presets");
    return { success: true, message: `Deleted stock preset '${preset.name}'.`, actionTaken: "DELETE_STOCK_PRESET" };
  } catch (err: any) {
    return { success: false, message: "Failed to delete preset", error: err.message };
  }
}

// -----------------------------------------------------------------------------
// 5. PRODUCTION & DECKLE PLANNING CRUD TOOLS
// -----------------------------------------------------------------------------

export async function agentGetProductionRuns(params: {
  status?: RunStatus;
  limit?: number;
}) {
  try {
    const runs = await db.productionRun.findMany({
      where: {
        ...(params.status ? { status: params.status } : {}),
      },
      include: {
        machine: { select: { name: true, code: true } },
        patterns: {
          include: { cuts: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: params.limit || 10,
    });

    return {
      success: true,
      message: `Found ${runs.length} production run(s).`,
      data: runs.map((r) => ({
        id: r.id,
        runNumber: r.runNumber,
        machine: r.machine.name,
        gsm: r.gsm,
        status: r.status,
        trimPercent: r.totalTrimPercent ? Number(r.totalTrimPercent) : 0,
        plannedKg: Number(r.totalPlannedKg),
        actualKg: Number(r.totalActualKg),
        patternsCount: r.patterns.length,
        createdAt: r.createdAt,
      })),
    };
  } catch (err: any) {
    return { success: false, message: "Failed to get production runs", error: err.message };
  }
}

export async function agentUpdateProductionRunStatus(input: {
  runNumberOrId: string;
  status: RunStatus;
}) {
  try {
    const run = await db.productionRun.findFirst({
      where: { OR: [{ id: input.runNumberOrId }, { runNumber: input.runNumberOrId }] },
    });
    if (!run) return { success: false, message: `Production run '${input.runNumberOrId}' not found.` };

    const updated = await db.productionRun.update({
      where: { id: run.id },
      data: {
        status: input.status,
        ...(input.status === RunStatus.RUNNING && !run.startedAt ? { startedAt: new Date() } : {}),
        ...(input.status === RunStatus.COMPLETED && !run.completedAt ? { completedAt: new Date() } : {}),
      },
    });

    revalidatePath("/production");
    revalidatePath(`/production/${run.id}`);
    return {
      success: true,
      message: `Updated Production Run #${run.runNumber} status to ${input.status}.`,
      actionTaken: "UPDATE_RUN_STATUS",
      data: updated,
    };
  } catch (err: any) {
    return { success: false, message: "Failed to update run status", error: err.message };
  }
}

export async function agentDeleteProductionRun(input: { runNumberOrId: string }) {
  try {
    const run = await db.productionRun.findFirst({
      where: { OR: [{ id: input.runNumberOrId }, { runNumber: input.runNumberOrId }] },
    });
    if (!run) return { success: false, message: `Production run '${input.runNumberOrId}' not found.` };

    await db.productionRun.delete({ where: { id: run.id } });
    revalidatePath("/production");
    revalidatePath("/deckle");
    return { success: true, message: `Deleted Production Run #${run.runNumber}.`, actionTaken: "DELETE_PRODUCTION_RUN" };
  } catch (err: any) {
    return { success: false, message: "Failed to delete production run", error: err.message };
  }
}

// -----------------------------------------------------------------------------
// 6. WASTAGE LOGS CRUD TOOLS
// -----------------------------------------------------------------------------

export async function agentGetWastageLogs(params?: { limit?: number; wastageType?: string }) {
  try {
    const logs = await db.wastageLog.findMany({
      where: {
        ...(params?.wastageType ? { wastageType: params.wastageType } : {}),
      },
      include: {
        productionRun: { select: { runNumber: true, gsm: true } },
      },
      orderBy: { recordedAt: "desc" },
      take: params?.limit || 15,
    });

    const totalWastageKg = logs.reduce((s, l) => s + Number(l.wastageKg), 0);
    return {
      success: true,
      message: `Found ${logs.length} wastage log(s) totaling ${totalWastageKg.toLocaleString("en-IN")} kg.`,
      data: logs.map((l) => ({
        id: l.id,
        runNumber: l.productionRun?.runNumber || "General",
        gsm: l.productionRun?.gsm,
        wastageKg: Number(l.wastageKg),
        wastageType: l.wastageType,
        reason: l.reason,
        recordedAt: l.recordedAt,
      })),
    };
  } catch (err: any) {
    return { success: false, message: "Failed to get wastage logs", error: err.message };
  }
}

export async function agentCreateWastageLog(input: {
  wastageKg: number;
  wastageType: "TRIM" | "REJECT" | "OTHER";
  reason?: string;
  runNumberOrId?: string;
}) {
  try {
    let runId: string | null = null;
    if (input.runNumberOrId) {
      const run = await db.productionRun.findFirst({
        where: { OR: [{ id: input.runNumberOrId }, { runNumber: input.runNumberOrId }] },
      });
      if (run) runId = run.id;
    }

    const log = await db.wastageLog.create({
      data: {
        wastageKg: new Prisma.Decimal(input.wastageKg.toFixed(3)),
        wastageType: input.wastageType,
        reason: input.reason || null,
        productionRunId: runId,
      },
    });

    revalidatePath("/production");
    return {
      success: true,
      message: `Logged ${input.wastageKg} kg of ${input.wastageType} waste${input.reason ? ` (${input.reason})` : ""}.`,
      actionTaken: "CREATE_WASTAGE_LOG",
      data: log,
    };
  } catch (err: any) {
    return { success: false, message: "Failed to record wastage log", error: err.message };
  }
}

// -----------------------------------------------------------------------------
// 7. MACHINES CRUD TOOLS
// -----------------------------------------------------------------------------

export async function agentGetMachines() {
  try {
    const machines = await db.machine.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { code: "asc" },
    });

    return {
      success: true,
      message: `Found ${machines.length} active machine(s).`,
      data: machines.map((m) => ({
        id: m.id,
        name: m.name,
        code: m.code,
        maxDeckleInch: Number(m.maxDeckleInch),
        minDeckleInch: Number(m.minDeckleInch),
        minTrimInch: Number(m.minTrimInch),
        maxTrimInch: Number(m.maxTrimInch),
        minGsm: m.minGsm,
        maxGsm: m.maxGsm,
        speedMpm: m.speedMpm,
      })),
    };
  } catch (err: any) {
    return { success: false, message: "Failed to get machines", error: err.message };
  }
}

export async function agentCreateMachine(input: {
  name: string;
  code: string;
  maxDeckleInch: number;
  minDeckleInch: number;
  minTrimInch?: number;
  maxTrimInch?: number;
  minGsm: number;
  maxGsm: number;
  speedMpm?: number;
}) {
  try {
    const machine = await db.machine.create({
      data: {
        name: input.name,
        code: input.code.toUpperCase(),
        maxDeckleInch: new Prisma.Decimal(input.maxDeckleInch.toFixed(2)),
        minDeckleInch: new Prisma.Decimal(input.minDeckleInch.toFixed(2)),
        minTrimInch: new Prisma.Decimal((input.minTrimInch || 0.5).toFixed(2)),
        maxTrimInch: new Prisma.Decimal((input.maxTrimInch || 6.0).toFixed(2)),
        minGsm: input.minGsm,
        maxGsm: input.maxGsm,
        speedMpm: input.speedMpm || 350,
      },
    });

    revalidatePath("/masters/machines");
    revalidateTag(LOOKUP_TAGS.machines);
    return {
      success: true,
      message: `Created machine '${machine.name}' (${machine.code}) with max deckle ${machine.maxDeckleInch}".`,
      actionTaken: "CREATE_MACHINE",
      data: machine,
    };
  } catch (err: any) {
    return { success: false, message: "Failed to create machine", error: err.message };
  }
}

export async function agentUpdateMachine(input: {
  codeOrId: string;
  name?: string;
  maxDeckleInch?: number;
  minDeckleInch?: number;
  speedMpm?: number;
}) {
  try {
    const machine = await db.machine.findFirst({
      where: { OR: [{ id: input.codeOrId }, { code: input.codeOrId }] },
    });
    if (!machine) return { success: false, message: `Machine '${input.codeOrId}' not found.` };

    const updated = await db.machine.update({
      where: { id: machine.id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.maxDeckleInch ? { maxDeckleInch: new Prisma.Decimal(input.maxDeckleInch.toFixed(2)) } : {}),
        ...(input.minDeckleInch ? { minDeckleInch: new Prisma.Decimal(input.minDeckleInch.toFixed(2)) } : {}),
        ...(input.speedMpm ? { speedMpm: input.speedMpm } : {}),
      },
    });

    revalidatePath("/masters/machines");
    revalidateTag(LOOKUP_TAGS.machines);
    return {
      success: true,
      message: `Updated machine '${updated.name}' (${updated.code}).`,
      actionTaken: "UPDATE_MACHINE",
      data: updated,
    };
  } catch (err: any) {
    return { success: false, message: "Failed to update machine", error: err.message };
  }
}

// -----------------------------------------------------------------------------
// 8. LOGISTICS: TRUCKS & TRANSPORTERS CRUD TOOLS
// -----------------------------------------------------------------------------

export async function agentGetTrucksAndTransporters() {
  try {
    const [transporters, trucks] = await Promise.all([
      db.transporter.findMany({ where: { deletedAt: null, isActive: true } }),
      db.truck.findMany({
        where: { deletedAt: null, isActive: true },
        include: { owner: { select: { name: true } } },
      }),
    ]);

    return {
      success: true,
      message: `Found ${transporters.length} transporter(s) and ${trucks.length} truck(s).`,
      data: {
        transporters: transporters.map((t) => ({
          id: t.id,
          name: t.name,
          phone: t.phone,
          gstin: t.gstin,
        })),
        trucks: trucks.map((tk) => ({
          id: tk.id,
          registrationNumber: tk.registrationNumber,
          capacityKg: tk.capacityKg,
          capacityMT: (tk.capacityKg / 1000).toFixed(2),
          transporter: tk.owner?.name || "Independent",
        })),
      },
    };
  } catch (err: any) {
    return { success: false, message: "Failed to get logistics data", error: err.message };
  }
}

export async function agentCreateTruck(input: {
  registrationNumber: string;
  capacityKg: number;
  transporterNameOrId?: string;
}) {
  try {
    let transporterId: string | null = null;
    if (input.transporterNameOrId) {
      const trans = await db.transporter.findFirst({
        where: {
          OR: [
            { id: input.transporterNameOrId },
            { name: { contains: input.transporterNameOrId } },
          ],
        },
      });
      if (trans) transporterId = trans.id;
    }

    const truck = await db.truck.create({
      data: {
        registrationNumber: input.registrationNumber.toUpperCase(),
        capacityKg: input.capacityKg,
        transporterId,
      },
    });

    revalidatePath("/logistics");
    return {
      success: true,
      message: `Registered Truck '${truck.registrationNumber}' (${(truck.capacityKg / 1000).toFixed(2)} MT).`,
      actionTaken: "CREATE_TRUCK",
      data: truck,
    };
  } catch (err: any) {
    return { success: false, message: "Failed to create truck", error: err.message };
  }
}

export async function agentCreateLoadBatch(input: {
  truckRegistration?: string;
  driverName?: string;
  driverPhone?: string;
  orderNumbers?: string[];
  notes?: string;
}) {
  try {
    const batchNumber = `LB-${Date.now().toString().slice(-6)}`;
    let truckId: string | null = null;
    if (input.truckRegistration) {
      const truck = await db.truck.findFirst({
        where: { registrationNumber: { contains: input.truckRegistration } },
      });
      if (truck) truckId = truck.id;
    }

    const batch = await db.loadBatch.create({
      data: {
        batchNumber,
        truckId,
        driverName: input.driverName || null,
        driverPhone: input.driverPhone || null,
        notes: input.notes || null,
        status: LoadStatus.DRAFT,
      },
    });

    revalidatePath("/logistics");
    return {
      success: true,
      message: `Created Load Batch #${batch.batchNumber} for dispatch planning.`,
      actionTaken: "CREATE_LOAD_BATCH",
      data: batch,
    };
  } catch (err: any) {
    return { success: false, message: "Failed to create load batch", error: err.message };
  }
}

// -----------------------------------------------------------------------------
// 9. INVOICES CRUD TOOLS
// -----------------------------------------------------------------------------

export async function agentGetInvoices(params: { status?: InvoiceStatus; limit?: number }) {
  try {
    const invoices = await db.invoice.findMany({
      where: { ...(params.status ? { status: params.status } : {}) },
      include: {
        client: { select: { name: true, city: true } },
        lines: true,
      },
      orderBy: { invoiceDate: "desc" },
      take: params.limit || 10,
    });

    return {
      success: true,
      message: `Found ${invoices.length} invoice(s).`,
      data: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        client: inv.client.name,
        city: inv.client.city,
        status: inv.status,
        subtotal: Number(inv.subtotal),
        totalAmount: Number(inv.totalAmount),
        date: inv.invoiceDate,
        lineItemsCount: inv.lines.length,
      })),
    };
  } catch (err: any) {
    return { success: false, message: "Failed to get invoices", error: err.message };
  }
}

export async function agentUpdateInvoiceStatus(input: {
  invoiceNumberOrId: string;
  status: InvoiceStatus;
}) {
  try {
    const invoice = await db.invoice.findFirst({
      where: { OR: [{ id: input.invoiceNumberOrId }, { invoiceNumber: input.invoiceNumberOrId }] },
    });
    if (!invoice) return { success: false, message: `Invoice '${input.invoiceNumberOrId}' not found.` };

    const updated = await db.invoice.update({
      where: { id: invoice.id },
      data: { status: input.status },
    });

    revalidatePath("/invoices");
    return {
      success: true,
      message: `Updated Invoice #${invoice.invoiceNumber} status to ${input.status}.`,
      actionTaken: "UPDATE_INVOICE_STATUS",
      data: updated,
    };
  } catch (err: any) {
    return { success: false, message: "Failed to update invoice", error: err.message };
  }
}

// -----------------------------------------------------------------------------
// 10. USERS & NOTIFICATIONS CRUD TOOLS
// -----------------------------------------------------------------------------

export async function agentGetUsers() {
  try {
    const users = await db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { name: "asc" },
    });

    return {
      success: true,
      message: `Found ${users.length} active user(s).`,
      data: users,
    };
  } catch (err: any) {
    return { success: false, message: "Failed to get users", error: err.message };
  }
}

export async function agentGetNotifications(params?: { limit?: number }) {
  try {
    const notifs = await db.whatsAppNotification.findMany({
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: params?.limit || 10,
    });

    return {
      success: true,
      message: `Found ${notifs.length} notification(s).`,
      data: notifs.map((n) => ({
        id: n.id,
        client: n.client.name,
        phone: n.phoneNumber,
        template: n.templateName,
        status: n.status,
        sentAt: n.sentAt,
      })),
    };
  } catch (err: any) {
    return { success: false, message: "Failed to get notifications", error: err.message };
  }
}

// -----------------------------------------------------------------------------
// 12. CROSS-MODULE OVERVIEW & PLANNING TOOLS
// -----------------------------------------------------------------------------

export async function agentGetDashboardSummary() {
  try {
    const [orders, production] = await Promise.all([
      getOrderSummaryStats(),
      getProductionSummaryStats(),
    ]);
    return {
      success: true,
      message: "Current mill KPIs.",
      data: {
        openOrders: orders.openOrdersCount,
        pendingKg: Math.round(orders.totalPendingKg),
        ordersDueThisWeek: orders.ordersDueThisWeek,
        overdueOrders: orders.overdueOrdersCount,
        productionRunsToday: production.runsToday,
        runningNow: production.runningNow,
        avgTrimPercentWeek: production.avgTrimWeek,
        kgProducedThisWeek: Math.round(production.totalKgProducedWeek),
      },
    };
  } catch (err: any) {
    return { success: false, message: "Failed to load dashboard summary", error: err.message };
  }
}

export async function agentGetDeckleDemand() {
  try {
    const items = await getPendingDemandItems();
    return {
      success: true,
      message: `${items.length} order line(s) awaiting deckle planning.`,
      data: items.map((it: any) => ({
        orderNumber: it.orderNumber,
        client: it.clientName,
        widthInch: it.widthInch,
        gsm: it.gsm,
        quantityKg: it.quantityKg,
        priority: it.priority,
        deliveryDate: it.deliveryDate,
      })),
    };
  } catch (err: any) {
    return { success: false, message: "Failed to load deckle demand", error: err.message };
  }
}

export async function agentRunDeckleOptimization(params?: { objective?: "MIN_TRIM" | "MIN_PATTERNS" | "BALANCED" }) {
  try {
    const ctx = getTenantContextSync();
    if (!ctx?.tenantId) return { success: false, message: "No tenant context." };

    const [demand, constraints] = await Promise.all([
      getPendingDemandItems(),
      getActiveMachineConstraints(ctx.tenantId),
    ]);
    if (demand.length === 0) {
      return { success: true, message: "No pending demand to optimize.", data: { runs: [] } };
    }
    const result = await runSolverOptimization({
      machines: constraints.machines.map((m: any) => ({
        id: m.id,
        name: m.name,
        max_deckle_inch: m.maxDeckleInch,
        min_deckle_inch: m.minDeckleInch,
        min_trim_inch: m.minTrimInch,
        max_trim_inch: m.maxTrimInch,
        min_gsm: m.minGsm,
        max_gsm: m.maxGsm,
      })),
      items: demand.map((it: any) => ({
        order_item_id: it.id,
        order_number: it.orderNumber,
        width_inch: it.widthInch,
        gsm: it.gsm,
        quantity_kg: it.quantityKg,
        tolerance_percent: it.tolerancePercent ?? 5,
        priority: it.priority,
        delivery_date: it.deliveryDate ? new Date(it.deliveryDate).toISOString() : null,
      })),
      options: { objective: params?.objective || "MIN_TRIM" } as any,
    });
    return {
      success: true,
      message: `Solver produced ${result.runs.length} run(s) at ${result.summary.total_trim_percent}% avg trim. This is a plan only — commit it from the Deckle Planning screen.`,
      data: {
        avgTrimPercent: result.summary.total_trim_percent,
        totalKg: result.summary.total_kg,
        runsCreated: result.summary.runs_created,
        machinesUsed: result.summary.machines_used,
        unassigned: result.unassigned_items?.length ?? 0,
      },
    };
  } catch (err: any) {
    return { success: false, message: "Deckle optimization failed", error: err.message };
  }
}

export async function agentGetPendingDispatches() {
  try {
    const batches = await getPendingDispatchLoadBatches();
    return {
      success: true,
      message: `${batches.length} load batch(es) ready for dispatch.`,
      data: batches.map((b: any) => ({
        batchNumber: b.batchNumber,
        truck: b.truck?.registrationNumber ?? "Unassigned",
        plannedDispatchDate: b.plannedDispatchDate,
        status: b.status,
        orders: b.orders?.length ?? 0,
        totalPlannedKg: Number(b.totalPlannedKg ?? 0),
      })),
    };
  } catch (err: any) {
    return { success: false, message: "Failed to load pending dispatches", error: err.message };
  }
}
