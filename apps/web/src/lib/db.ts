import { PrismaClient } from "@/generated/prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { resolveTenantContext, TenantContextError } from "@/lib/tenant-context";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __prismaD1: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __prismaScoped: unknown | undefined;
}

/**
 * Database access.
 *
 * Production + `wrangler dev` + `next dev`  -> Cloudflare D1 via the `DB` binding.
 * Plain Node scripts with no Worker context  -> local SQLite file from DATABASE_URL.
 *
 * `db` is a lazy proxy so the D1 binding — resolved only inside a request on the
 * Worker — is picked up on first use, not at module load. Every access also runs
 * the tenant-isolation `$extends` (see `withTenantScope`).
 */

/** PrismaClients backed by the D1 adapter (no interactive-transaction support). */
const d1Clients = new WeakSet<object>();

function clientFromD1(d1: unknown): PrismaClient {
  const binding = d1 as { withSession?: (constraint: string) => unknown };
  const client =
    typeof binding?.withSession === "function"
      ? binding.withSession("first-unconstrained")
      : d1;

  const prisma = new PrismaClient({
    adapter: new PrismaD1(client as never),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  d1Clients.add(prisma);
  return prisma;
}

function localClient(): PrismaClient {
  if (globalThis.__prisma) return globalThis.__prisma;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaBetterSQLite3 } = require("@prisma/adapter-better-sqlite3");
  const url = process.env.DATABASE_URL || "file:./prisma/dev.db";
  const client = new PrismaClient({
    adapter: new PrismaBetterSQLite3({ url }),
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
  if (process.env.NODE_ENV !== "production") globalThis.__prisma = client;
  return client;
}

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------

/** Models with their own `tenantId` column. */
const DIRECT_SCOPED = new Set([
  "Client", "Machine", "Transporter", "Truck", "StockPreset", "Order",
  "ProductionRun", "LoadBatch", "Dispatch", "Invoice", "StockItem",
  "WastageLog", "WhatsAppNotification", "AuditLog", "SystemSetting",
]);

/** Child models scoped through a parent relation path. */
const RELATION_SCOPED: Record<string, string[]> = {
  OrderItem: ["order"],
  CuttingPattern: ["productionRun"],
  PatternCut: ["cuttingPattern", "productionRun"],
  LoadBatchOrder: ["loadBatch"],
  InvoiceLine: ["invoice"],
};

const READ_OPS = new Set([
  "findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy",
]);
const WRITE_WHERE_OPS = new Set(["update", "updateMany", "delete", "deleteMany", "upsert"]);

function nestFilter(path: string[], tenantId: string): Record<string, unknown> {
  return path.reduceRight<Record<string, unknown>>(
    (acc, key) => ({ [key]: acc }),
    { tenantId }
  );
}

function mergeWhere(where: unknown, filter: Record<string, unknown>) {
  return where && Object.keys(where as object).length > 0
    ? { AND: [where, filter] }
    : filter;
}

/** True when the caller already pinned a tenant explicitly (platform-service, scripts). */
function hasExplicitTenant(args: any): boolean {
  return Boolean(args?.where?.tenantId || args?.data?.tenantId);
}

function withTenantScope(client: PrismaClient): PrismaClient {
  const extended = client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const isDirect = DIRECT_SCOPED.has(model);
          const relPath = RELATION_SCOPED[model];
          if (!isDirect && !relPath) return query(args);

          const ctx = await resolveTenantContext();

          // Platform staff: no auto-scoping (platform code filters explicitly).
          if (ctx?.isPlatform) return query(args);

          const a: any = args ?? {};

          if (!ctx?.tenantId) {
            if (hasExplicitTenant(a)) return query(args);
            throw new TenantContextError(
              `No tenant context for ${model}.${operation} — request is not scoped to a mill.`
            );
          }
          const tenantId = ctx.tenantId;

          if (operation === "findUnique" || operation === "findUniqueOrThrow") {
            throw new TenantContextError(
              `${model}.${operation} is not tenant-safe — use findFirst.`
            );
          }

          if (isDirect) {
            if (READ_OPS.has(operation) || WRITE_WHERE_OPS.has(operation)) {
              a.where = mergeWhere(a.where, { tenantId });
            }
            if (operation === "create") {
              a.data = { ...(a.data ?? {}), tenantId };
            }
            if (operation === "createMany") {
              const rows = Array.isArray(a.data) ? a.data : [a.data];
              a.data = rows.map((r: any) => ({ ...r, tenantId }));
            }
            if (operation === "upsert") {
              a.create = { ...(a.create ?? {}), tenantId };
            }
            return query(a);
          }

          // RELATION_SCOPED
          if (
            READ_OPS.has(operation) ||
            operation === "updateMany" ||
            operation === "deleteMany"
          ) {
            a.where = mergeWhere(a.where, nestFilter(relPath!, tenantId));
            return query(a);
          }
          // create / update / delete / upsert on a child: always nested under a
          // scoped parent, or guarded upstream by a scoped findFirst.
          return query(args);
        },
      },
    },
  });
  d1Clients.add(extended as object);
  return extended as unknown as PrismaClient;
}

let localScoped: PrismaClient | undefined;

function resolveClient(): PrismaClient {
  try {
    const d1 = (getCloudflareContext() as unknown as { env?: { DB?: unknown } })?.env?.DB;
    if (d1) {
      globalThis.__prismaD1 ??= clientFromD1(d1);
      globalThis.__prismaScoped ??= withTenantScope(globalThis.__prismaD1);
      return globalThis.__prismaScoped as PrismaClient;
    }
  } catch {
    // not in a Cloudflare context — fall through to local SQLite
  }
  localScoped ??= withTenantScope(localClient());
  return localScoped;
}

/**
 * Cloudflare D1 has no interactive transactions. On a D1-backed client this shim
 * runs the interactive callback against the (scoped) client directly. Array-form
 * `$transaction([...])` and the local better-sqlite3 client run natively.
 */
function txShim(client: PrismaClient) {
  const native = client.$transaction.bind(client) as (...a: unknown[]) => Promise<unknown>;
  return (...args: unknown[]) => {
    if (typeof args[0] === "function" && d1Clients.has(client as object)) {
      const callback = args[0] as (tx: PrismaClient) => Promise<unknown>;
      return Promise.resolve(callback(client));
    }
    return native(...args);
  };
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = resolveClient() as any;
    if (prop === "$transaction") return txShim(client);
    const value = client[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/**
 * Explicit accessor for contexts where the Worker env is already in hand.
 */
export function getDb(env?: { DB?: unknown }): PrismaClient {
  if (env?.DB) {
    globalThis.__prismaD1 ??= clientFromD1(env.DB);
    globalThis.__prismaScoped ??= withTenantScope(globalThis.__prismaD1);
    return globalThis.__prismaScoped as PrismaClient;
  }
  return db;
}
