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
import { requireRole } from "@/server/auth-helpers";
import { getOrderSummaryStats } from "./order-service";
import {
  getProductionSummaryStats,
  releaseRunToFloor,
  startProductionRun,
  completeProductionRun,
  cancelProductionRun,
} from "./production-service";
import { getPendingDemandItems, runSolverOptimization } from "./deckle-service";
import { getPendingDispatchLoadBatches } from "./dispatch-service";
import { getActiveMachineConstraints } from "./order-service";
import { generateReelNumber, allocateStockToOrderItem } from "./stock-service";
import { getSystemSettings } from "./settings-service";

/**
 * Every write-capable agent tool below gates itself the same way its
 * equivalent UI action does — the AI assistant must never be a back door
 * around the role permissions the rest of the app enforces.
 */
const AGENT_ROLE = {
  ORDER_WRITE: [Role.ADMIN, Role.SALES] as Role[],
  CLIENT_WRITE: [Role.ADMIN] as Role[],
  STOCK_WRITE: [Role.ADMIN, Role.PLANNER, Role.DISPATCH] as Role[],
  PRESET_WRITE: [Role.ADMIN] as Role[],
  RUN_WRITE: [Role.ADMIN, Role.PLANNER, Role.OPERATOR] as Role[],
  WASTAGE_WRITE: [Role.ADMIN, Role.PLANNER, Role.DISPATCH] as Role[],
  MACHINE_WRITE: [Role.ADMIN] as Role[],
  TRUCK_WRITE: [Role.ADMIN] as Role[],
  LOGISTICS_WRITE: [Role.ADMIN, Role.PLANNER, Role.DISPATCH] as Role[],
  INVOICE_CANCEL: [Role.ADMIN] as Role[],
};

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
    await requireRole(...AGENT_ROLE.ORDER_WRITE);
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
    await requireRole(...AGENT_ROLE.ORDER_WRITE);
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

export async function agentDeleteOrder(input: { orderNumberOrId: string }) {
  try {
    await requireRole(...AGENT_ROLE.ORDER_WRITE);
    const order = await db.order.findFirst({
      where: {
        OR: [{ id: input.orderNumberOrId }, { orderNumber: input.orderNumberOrId }],
      },
    });

    if (!order) {
      return { success: false, message: `Order '${input.orderNumberOrId}' not found.` };
    }

    // A DRAFT order was never confirmed and nothing downstream depends on it,
    // so a hard delete is safe. Anything further along (CONFIRMED or later)
    // is cancelled instead — same as the UI, which never hard-deletes a real
    // order — to preserve the audit trail and free its demand for re-planning.
    if (order.status === OrderStatus.DRAFT) {
      await db.orderItem.deleteMany({ where: { orderId: order.id } });
      await db.order.delete({ where: { id: order.id } });

      revalidatePath("/orders");
      revalidateTag(DASHBOARD_TAG);
      revalidatePath("/deckle");

      return {
        success: true,
        message: `Deleted draft Sales Order #${order.orderNumber} and all its line items.`,
        actionTaken: "DELETE_ORDER",
      };
    }

    if (order.status === OrderStatus.DISPATCHED || order.status === OrderStatus.CANCELLED) {
      return {
        success: false,
        message: `Order #${order.orderNumber} is already ${order.status} and cannot be removed.`,
      };
    }

    const cancelled = await db.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.CANCELLED },
    });

    revalidatePath("/orders");
    revalidateTag(DASHBOARD_TAG);
    revalidatePath("/deckle");

    return {
      success: true,
      message: `Order #${order.orderNumber} was already ${order.status}, so it was cancelled instead of deleted (its history is kept).`,
      actionTaken: "CANCEL_ORDER",
      data: cancelled,
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
    await requireRole(...AGENT_ROLE.CLIENT_WRITE);
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
    await requireRole(...AGENT_ROLE.CLIENT_WRITE);
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
    await requireRole(...AGENT_ROLE.CLIENT_WRITE);
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
    await requireRole(...AGENT_ROLE.STOCK_WRITE);
    const { reelNumberPrefix } = await getSystemSettings();
    const reel = await db.$transaction(async (tx) => {
      const reelNumber = await generateReelNumber(tx, reelNumberPrefix);
      return tx.stockItem.create({
        data: {
          reelNumber,
          widthInch: new Prisma.Decimal(input.widthInch.toFixed(2)),
          gsm: input.gsm,
          quantityKg: new Prisma.Decimal(input.quantityKg.toFixed(3)),
          location: input.location || "BAY-A",
          status: input.orderItemId ? StockStatus.ALLOCATED : StockStatus.AVAILABLE,
          orderItemId: input.orderItemId || null,
        },
      });
    });

    revalidatePath("/inventory");
    return {
      success: true,
      message: `Added reel ${reel.reelNumber} into stock: ${input.widthInch}" ${input.gsm}GSM (${input.quantityKg} kg) at ${reel.location}.`,
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
    await requireRole(...AGENT_ROLE.STOCK_WRITE);
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
    await requireRole(...AGENT_ROLE.STOCK_WRITE);
    const reel = await db.stockItem.findFirst({ where: { id: input.id } });
    if (!reel) return { success: false, message: `Stock reel '${input.id}' not found.` };
    if (reel.status !== StockStatus.AVAILABLE) {
      return {
        success: false,
        message: `Reel ${reel.reelNumber || reel.id} is ${reel.status}, not AVAILABLE — deallocate it from the Stock screen before deleting so the order/dispatch it's tied to isn't left inconsistent.`,
      };
    }
    await db.stockItem.delete({ where: { id: input.id } });
    revalidatePath("/inventory");
    return { success: true, message: `Deleted stock reel '${reel.reelNumber || input.id}'.`, actionTaken: "DELETE_STOCK_REEL" };
  } catch (err: any) {
    return { success: false, message: "Failed to delete stock reel", error: err.message };
  }
}

export async function agentAllocateStockToOrderItem(input: {
  stockItemId: string;
  orderItemId: string;
}) {
  try {
    const result = await allocateStockToOrderItem(input.stockItemId, input.orderItemId);
    if ("error" in result && result.error) {
      return { success: false, message: result.error, error: result.error };
    }
    const { updatedStock, updatedOrderItem } = result.data!;
    revalidatePath("/inventory");
    revalidatePath("/orders");
    revalidateTag(DASHBOARD_TAG);
    return {
      success: true,
      message: `Allocated reel ${(updatedStock as any).reelNumber || updatedStock.id} to the order line — order item is now at ${Number(updatedOrderItem.producedKg)} kg produced.`,
      actionTaken: "ALLOCATE_STOCK",
      data: result.data,
    };
  } catch (err: any) {
    return { success: false, message: "Failed to allocate stock to order", error: err.message };
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
    await requireRole(...AGENT_ROLE.PRESET_WRITE);
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
    await requireRole(...AGENT_ROLE.PRESET_WRITE);
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

/**
 * Routes through the SAME lifecycle functions the UI uses (releaseRunToFloor /
 * startProductionRun / completeProductionRun / cancelProductionRun) instead of
 * flipping the `status` column directly — a raw flip to COMPLETED would skip
 * creating the finished-goods stock reels and updating order fulfillment,
 * silently leaving the order underproduced despite showing a completed run.
 */
export async function agentUpdateProductionRunStatus(input: {
  runNumberOrId: string;
  status: RunStatus;
  /** Required to move to COMPLETED — actual output weight in kg. */
  actualKg?: number;
  /** Trim/edge waste in kg, for a COMPLETED transition. */
  trimWasteKg?: number;
  wastageReason?: string;
  /** For a CANCELLED transition. */
  reason?: string;
}) {
  try {
    await requireRole(...AGENT_ROLE.RUN_WRITE);
    const run = await db.productionRun.findFirst({
      where: { OR: [{ id: input.runNumberOrId }, { runNumber: input.runNumberOrId }] },
    });
    if (!run) return { success: false, message: `Production run '${input.runNumberOrId}' not found.` };

    switch (input.status) {
      case RunStatus.RELEASED: {
        const updated = await releaseRunToFloor(run.id);
        return {
          success: true,
          message: `Production Run #${run.runNumber} released to the floor.`,
          actionTaken: "RELEASE_RUN",
          data: updated,
        };
      }
      case RunStatus.RUNNING: {
        const updated = await startProductionRun(run.id);
        return {
          success: true,
          message: `Production Run #${run.runNumber} started.`,
          actionTaken: "START_RUN",
          data: updated,
        };
      }
      case RunStatus.COMPLETED: {
        if (!input.actualKg || input.actualKg <= 0) {
          return {
            success: false,
            message: `Completing a run needs the actual output weight (actualKg) — planned was ${Number(run.totalPlannedKg)} kg. Ask the user for the real figure rather than assuming it matches plan.`,
          };
        }
        const updated = await completeProductionRun({
          runId: run.id,
          actualKg: input.actualKg,
          trimWasteKg: input.trimWasteKg || 0,
          wastageReason: input.wastageReason,
        });
        return {
          success: true,
          message: `Production Run #${run.runNumber} marked complete: ${input.actualKg} kg actual output, finished reels created and credited to their orders.`,
          actionTaken: "COMPLETE_RUN",
          data: updated,
        };
      }
      case RunStatus.CANCELLED: {
        await cancelProductionRun(run.id, input.reason);
        return {
          success: true,
          message: `Production Run #${run.runNumber} cancelled. Its demand items were reverted to CONFIRMED for re-planning.`,
          actionTaken: "CANCEL_RUN",
        };
      }
      default:
        return {
          success: false,
          message: `'${input.status}' is not a supported transition from here. Valid targets: RELEASED, RUNNING, COMPLETED, CANCELLED.`,
        };
    }
  } catch (err: any) {
    return { success: false, message: "Failed to update run status", error: err.message };
  }
}

export async function agentDeleteProductionRun(input: { runNumberOrId: string }) {
  try {
    await requireRole(...AGENT_ROLE.RUN_WRITE);
    const run = await db.productionRun.findFirst({
      where: { OR: [{ id: input.runNumberOrId }, { runNumber: input.runNumberOrId }] },
    });
    if (!run) return { success: false, message: `Production run '${input.runNumberOrId}' not found.` };

    // Once a run has started, RUNNING/COMPLETED carry real consequences
    // (started machine, or credited stock/order fulfillment) that a raw
    // delete would silently orphan. Only a PLANNED run — nothing has
    // happened yet — is safe to hard-delete; anything active gets cancelled
    // instead, same as the UI.
    if (run.status !== RunStatus.PLANNED && run.status !== RunStatus.CANCELLED) {
      await cancelProductionRun(run.id, "Cancelled via PaperMill AI instead of deletion (run had already started).");
      return {
        success: true,
        message: `Production Run #${run.runNumber} was ${run.status}, so it was cancelled instead of deleted — its demand items are back to CONFIRMED for re-planning.`,
        actionTaken: "CANCEL_RUN",
      };
    }

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
    await requireRole(...AGENT_ROLE.WASTAGE_WRITE);
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
    await requireRole(...AGENT_ROLE.MACHINE_WRITE);
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
    await requireRole(...AGENT_ROLE.MACHINE_WRITE);
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
    await requireRole(...AGENT_ROLE.TRUCK_WRITE);
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
    await requireRole(...AGENT_ROLE.LOGISTICS_WRITE);
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
  /** Required to cancel an invoice. */
  reason?: string;
}) {
  try {
    const invoice = await db.invoice.findFirst({
      where: { OR: [{ id: input.invoiceNumberOrId }, { invoiceNumber: input.invoiceNumberOrId }] },
    });
    if (!invoice) return { success: false, message: `Invoice '${input.invoiceNumberOrId}' not found.` };

    if (input.status === InvoiceStatus.CANCELLED) {
      if (!input.reason?.trim()) {
        return { success: false, message: "Cancelling an invoice needs a reason — ask the user for one." };
      }
      const { cancelInvoice } = await import("./invoice-service");
      const updated = await cancelInvoice(invoice.id, input.reason.trim());
      return {
        success: true,
        message: `Cancelled Invoice #${invoice.invoiceNumber}: ${input.reason.trim()}.`,
        actionTaken: "CANCEL_INVOICE",
        data: updated,
      };
    }

    await requireRole(...AGENT_ROLE.INVOICE_CANCEL);
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

export async function agentCreateInvoicesFromDispatch(input: { dispatchNumberOrId: string }) {
  try {
    const dispatch = await db.dispatch.findFirst({
      where: { OR: [{ id: input.dispatchNumberOrId }, { dispatchNumber: input.dispatchNumberOrId }] },
    });
    if (!dispatch) {
      return { success: false, message: `Dispatch '${input.dispatchNumberOrId}' not found.` };
    }
    const { createInvoicesFromDispatch } = await import("./invoice-service");
    const invoices = await createInvoicesFromDispatch(dispatch.id);
    revalidatePath("/invoices");
    revalidatePath("/dispatch/history");
    return {
      success: true,
      message: `Generated ${invoices.length} invoice(s) from Dispatch #${dispatch.dispatchNumber}: ${invoices.map((i) => i.invoiceNumber).join(", ")}.`,
      actionTaken: "CREATE_INVOICES_FROM_DISPATCH",
      data: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        client: (inv as any).client?.name,
        totalAmount: Number(inv.totalAmount),
        status: inv.status,
      })),
    };
  } catch (err: any) {
    return { success: false, message: "Failed to generate invoices from dispatch", error: err.message };
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

export async function agentGetDispatchHistory(params?: { vehicleNumber?: string; limit?: number }) {
  try {
    const { getDispatchHistory } = await import("./dispatch-service");
    const res = await getDispatchHistory({
      page: 1,
      pageSize: params?.limit || 15,
      vehicleNumber: params?.vehicleNumber,
    });
    return {
      success: true,
      message: `Found ${res.rows.length} dispatch(es).`,
      data: (res.rows as any[]).map((d) => ({
        id: d.id,
        dispatchNumber: d.dispatchNumber,
        gatePassNumber: d.gatePassNumber,
        vehicleNumber: d.vehicleNumber,
        driverName: d.driverName,
        totalDispatchedKg: Number(d.totalDispatchedKg),
        dispatchedAt: d.dispatchedAt,
        batchNumber: d.loadBatch?.batchNumber,
        batchStatus: d.loadBatch?.status,
        clients: Array.from(new Set((d.loadBatch?.orders || []).map((o: any) => o.order.client.name))),
        invoicesCount: d.invoices?.length ?? 0,
      })),
    };
  } catch (err: any) {
    return { success: false, message: "Failed to load dispatch history", error: err.message };
  }
}

export async function agentMarkDispatchDelivered(input: { dispatchNumberOrId: string }) {
  try {
    const dispatch = await db.dispatch.findFirst({
      where: { OR: [{ id: input.dispatchNumberOrId }, { dispatchNumber: input.dispatchNumberOrId }] },
    });
    if (!dispatch) {
      return { success: false, message: `Dispatch '${input.dispatchNumberOrId}' not found.` };
    }
    const { markDispatchDelivered } = await import("./dispatch-service");
    await markDispatchDelivered(dispatch.id);
    return {
      success: true,
      message: `Dispatch #${dispatch.dispatchNumber} marked DELIVERED — delivery WhatsApp notifications enqueued for every client on the load.`,
      actionTaken: "MARK_DISPATCH_DELIVERED",
    };
  } catch (err: any) {
    return { success: false, message: "Failed to mark dispatch delivered", error: err.message };
  }
}

// -----------------------------------------------------------------------------
// 13. ANALYTICS
// -----------------------------------------------------------------------------

export async function agentGetAnalytics(params?: {
  timeRange?: "last_3_months" | "last_6_months" | "last_12_months" | "this_year";
}) {
  try {
    const { getAnalyticsData } = await import("./analytics-service");
    const data = await getAnalyticsData({ timeRange: params?.timeRange || "last_6_months" });
    return {
      success: true,
      message: "Mill analytics summary.",
      data: {
        kpis: data.kpis,
        monthlyTrends: data.monthlyTrends,
        wastageBreakdown: data.wastageBreakdown,
        gsmDistribution: data.gsmDistribution,
        machinePerformance: data.machinePerformance,
        topClients: data.topClients,
      },
    };
  } catch (err: any) {
    return { success: false, message: "Failed to load analytics", error: err.message };
  }
}
