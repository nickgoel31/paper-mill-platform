import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Creates a Prisma client using the correct adapter for the environment:
 * 1. Cloudflare D1 (via env.DB binding injected by OpenNext/wrangler)
 * 2. Neon serverless Postgres (DATABASE_URL contains neon.tech)
 * 3. Local Postgres (direct connection string)
 */
function createPrismaClient(d1Binding?: unknown): PrismaClient {
  // 1. Cloudflare D1 binding (passed from the Worker env at request time)
  if (d1Binding) {
    const adapter = new PrismaD1(d1Binding as any);
    return new PrismaClient({
      adapter: adapter as any,
      log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
  }

  const dbUrl = process.env.DATABASE_URL || "";
  const isNeon = dbUrl.includes("neon.tech") || dbUrl.includes("sslmode=require");

  // 2. Neon serverless Postgres
  if (isNeon) {
    if (typeof globalThis.WebSocket === "undefined") {
      neonConfig.webSocketConstructor = ws;
    }
    neonConfig.poolQueryViaFetch = true;
    const adapter = new PrismaNeon({ connectionString: dbUrl });
    return new PrismaClient({
      adapter: adapter as any,
      log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
  }

  // 3. Local Postgres fallback
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

// Singleton for non-edge (local dev) environments
export const db: PrismaClient = globalThis.__prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.__prisma = db;

/**
 * Call this in Cloudflare Workers/OpenNext contexts where env.DB is available.
 * Returns a D1-backed Prisma client for the current request.
 */
export function getDb(env?: { DB?: unknown }): PrismaClient {
  if (env?.DB) {
    return createPrismaClient(env.DB);
  }
  return db;
}
