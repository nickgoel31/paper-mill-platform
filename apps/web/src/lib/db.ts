import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const dbUrl = process.env.DATABASE_URL || "";
  const isNeon = dbUrl.includes("neon.tech") || dbUrl.includes("sslmode=require");

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

  // Local development / direct PostgreSQL fallback
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
