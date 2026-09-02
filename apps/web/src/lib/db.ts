import { PrismaClient } from "@/generated/prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __prismaD1: PrismaClient | undefined;
}

/**
 * Database access.
 *
 * Production + `wrangler dev` + `next dev`  -> Cloudflare D1 via the `DB` binding
 *   (declared in wrangler.toml, surfaced by OpenNext / initOpenNextCloudflareForDev).
 * Plain Node scripts with no Worker context  -> local SQLite file from
 *   DATABASE_URL (e.g. "file:./prisma/dev.db"), via better-sqlite3.
 *
 * `db` is a lazy proxy so the D1 binding — which only exists inside a request on
 * the Worker — is resolved on first use, not at module load.
 */

function clientFromD1(d1: unknown): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaD1(d1 as never),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function localClient(): PrismaClient {
  if (globalThis.__prisma) return globalThis.__prisma;
  // Lazy require so the native better-sqlite3 module is never pulled into the
  // Worker bundle.
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

function resolveClient(): PrismaClient {
  // Attempt to pick up the Cloudflare D1 binding (present on the Worker and,
  // via initOpenNextCloudflareForDev, during `next dev`).
  try {
    const d1 = (getCloudflareContext() as unknown as { env?: { DB?: unknown } })?.env?.DB;
    if (d1) {
      globalThis.__prismaD1 ??= clientFromD1(d1);
      return globalThis.__prismaD1;
    }
  } catch {
    // Not running inside a Cloudflare context — fall through to local SQLite.
  }
  return localClient();
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = resolveClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/**
 * Explicit accessor for contexts where the Worker env is already in hand.
 */
export function getDb(env?: { DB?: unknown }): PrismaClient {
  if (env?.DB) {
    globalThis.__prismaD1 ??= clientFromD1(env.DB);
    return globalThis.__prismaD1;
  }
  return db;
}
