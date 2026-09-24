export type ReportType =
  | "orders"
  | "production"
  | "dispatch"
  | "wastage"
  | "invoices"
  | "stock"
  | "daily-backlog";

export interface ReportFilter {
  startDate?: string | Date;
  endDate?: string | Date;
}

export interface ReportColumn {
  key: string;
  header: string;
}

export interface ReportResult {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
}

export const REPORT_DEFINITIONS: { type: ReportType; title: string; description: string; dated: boolean }[] = [
  { type: "orders", title: "Sales / Orders Report", description: "Orders booked in the selected period, by client and status.", dated: true },
  { type: "production", title: "Production Report", description: "Production runs, machine output and trim loss.", dated: true },
  { type: "dispatch", title: "Dispatch / Logistics Report", description: "Outbound dispatches, vehicles and destinations.", dated: true },
  { type: "wastage", title: "Wastage Report", description: "Recorded wastage by type and reason.", dated: true },
  { type: "invoices", title: "Invoices & Payments Report", description: "Invoices raised, amounts and payment status.", dated: true },
  { type: "stock", title: "Current Stock Report", description: "Live snapshot of stock items in inventory (not date-filtered).", dated: false },
  { type: "daily-backlog", title: "Daily Order Backlog (PDF)", description: "Per-party opening/new/dispatched/closing order backlog by client type, generated automatically every day at close of business.", dated: false },
];
