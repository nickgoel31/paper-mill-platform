import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaD1 } from "@prisma/adapter-d1";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  DB?: any; // Cloudflare D1 Database binding
};

function createPrismaClient(): PrismaClient {
  // 1. Cloudflare D1 Serverless SQL (if running inside Cloudflare Workers with D1 binding)
  if (typeof globalThis !== "undefined" && (globalThis as any).DB) {
    const adapter = new PrismaD1((globalThis as any).DB);
    return new PrismaClient({
      adapter: adapter as any,
      log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
  }

  const dbUrl = process.env.DATABASE_URL || "";
  const isNeon = dbUrl.includes("neon.tech") || dbUrl.includes("sslmode=require");

  // 2. Neon / Serverless PostgreSQL via HTTP/WebSocket adapter
  if (isNeon) {
    // Configure WebSocket for environments where WebSocket isn't globally available (Node.js runtime)
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

  // 3. Local development / direct PostgreSQL fallback
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
