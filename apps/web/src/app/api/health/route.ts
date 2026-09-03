import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Lightweight liveness probe. Pinged every few minutes by the solver worker's
 * cron trigger to keep the Worker isolate — and the Prisma/D1 connection — warm,
 * so real users rarely pay the cold-start penalty (~0.5s of WASM init).
 *
 * Kept deliberately cheap: one `SELECT 1` round trip.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      db: "ok",
      latencyMs: Date.now() - startedAt,
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "degraded",
        db: "error",
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 }
    );
  }
}
