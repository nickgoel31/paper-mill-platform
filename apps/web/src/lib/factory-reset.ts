export type FactoryResetCategory = "orders" | "stock" | "production" | "dispatch" | "auditLogs";

export const FACTORY_RESET_CATEGORY_INFO: Record<FactoryResetCategory, { label: string; description: string }> = {
  orders: { label: "Sales Orders", description: "Every order and its line items." },
  stock: { label: "Inventory / Stock Reels", description: "Every warehouse stock reel." },
  production: {
    label: "Production Runs & Cutting Patterns",
    description: "Production runs, cutting patterns, and wastage logs.",
  },
  dispatch: {
    label: "Dispatch, Loads & Invoices",
    description: "Truck loads, dispatches, invoices, payments, and WhatsApp notifications.",
  },
  auditLogs: { label: "Audit Log", description: "The activity/audit trail itself." },
};
