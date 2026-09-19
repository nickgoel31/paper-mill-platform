/**
 * HRA Paper Mill — Cutting Stock Solver Worker (Pure TypeScript)
 * Deployed to Cloudflare Workers — no Docker, no containers required.
 *
 * The optimiser itself lives in ./engine (column generation over an LP master).
 */

import { solve, type SolverRequestPayload } from "./engine";

export interface Env {
  /** Base URL of the ERP web worker to keep warm. Overridable via wrangler vars. */
  WEB_APP_URL?: string;
}

const DEFAULT_WEB_APP_URL = "https://paper-mill-platform.thewalkingjumbo.workers.dev";

/** Reject payloads the engine can't reason about, with a message the planner can act on. */
function validate(p: SolverRequestPayload): string | null {
  const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
  for (const m of p.machines) {
    if (!finite(m.max_deckle_inch) || m.max_deckle_inch <= 0) return `machine ${m.id}: max_deckle_inch must be positive`;
    if (!finite(m.min_trim_inch) || m.min_trim_inch < 0) return `machine ${m.id}: min_trim_inch must be >= 0`;
    if (!finite(m.max_trim_inch) || m.max_trim_inch < 0) return `machine ${m.id}: max_trim_inch must be >= 0`;
  }
  for (const it of p.items) {
    if (!finite(it.width_inch) || it.width_inch <= 0) return `item ${it.order_item_id}: width_inch must be positive`;
    if (!finite(it.gsm) || it.gsm <= 0) return `item ${it.order_item_id}: gsm must be positive`;
    if (!finite(it.quantity_kg) || it.quantity_kg < 0) return `item ${it.order_item_id}: quantity_kg must be >= 0`;
  }
  return null;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };

export default {
  /**
   * Cron-triggered keep-warm ping for the ERP web worker. Hitting the DB-backed
   * health endpoint keeps that isolate (and its Prisma/D1 connection) hot so
   * interactive navigations don't pay cold-start latency.
   */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const base = env.WEB_APP_URL || DEFAULT_WEB_APP_URL;
    ctx.waitUntil(
      fetch(`${base}/api/health`, { headers: { "user-agent": "hra-solver-keepwarm" } })
        .then((r) => console.log(`[keep-warm] ${base}/api/health -> ${r.status}`))
        .catch((e) => console.warn(`[keep-warm] failed: ${e}`))
    );
  },

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/" || url.pathname === "/health")
      return new Response(JSON.stringify({ status: "ok", service: "hra-solver-worker", engine: "column-generation-lp", version: "3.0" }), { headers: { "Content-Type": "application/json", ...CORS } });
    if (url.pathname === "/optimize" && req.method === "POST") {
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
      let payload: SolverRequestPayload;
      try {
        payload = (await req.json()) as SolverRequestPayload;
      } catch (e: any) {
        return json({ error: "bad request", detail: e?.message }, 400);
      }
      if (!payload?.machines?.length) return json({ error: "machines required" }, 400);
      if (!payload?.items?.length) return json({ error: "items required" }, 400);
      const problem = validate(payload);
      if (problem) return json({ error: "invalid payload", detail: problem }, 422);
      try {
        return json(solve(payload));
      } catch (e: any) {
        console.error("[solver] engine failure", e);
        return json({ error: "solver failure", detail: e?.message }, 500);
      }
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "Content-Type": "application/json", ...CORS } });
  },
};
