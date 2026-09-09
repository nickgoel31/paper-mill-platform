/**
 * Centralised `revalidateTag` / `unstable_cache` tag names.
 *
 * Kept in its own module (no `"use server"` directive) so it can be imported by
 * both server-action files and plain modules — a `"use server"` file may only
 * export async functions.
 *
 * NOTE: cache *keys* are per-tenant (they include `tenantId`), so one mill can
 * never read another's cached payload. Tags stay global — busting
 * `dashboard-data` re-fetches every mill's dashboard, each from its own scope,
 * which is wasteful but never wrong.
 */

export const DASHBOARD_TAG = "dashboard-data";

export const LOOKUP_TAGS = {
  clients: "lookup:clients",
  machines: "lookup:machines",
  trucks: "lookup:trucks",
  transporters: "lookup:transporters",
  stockPresets: "lookup:stock-presets",
} as const;
