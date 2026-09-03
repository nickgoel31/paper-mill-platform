/**
 * HRA Paper Mill — Cutting Stock Solver Worker (Pure TypeScript)
 * Deployed to Cloudflare Workers — no Docker, no containers required.
 */

export interface Env {
  /** Base URL of the ERP web worker to keep warm. Overridable via wrangler vars. */
  WEB_APP_URL?: string;
}

const DEFAULT_WEB_APP_URL = "https://paper-mill-platform.thewalkingjumbo.workers.dev";

interface SolverMachineInput {
  id: string;
  name: string;
  max_deckle_inch: number;
  min_deckle_inch: number;
  min_trim_inch: number;
  max_trim_inch: number;
  min_gsm: number;
  max_gsm: number;
}

interface SolverItemInput {
  order_item_id: string;
  order_number?: string | null;
  width_inch: number;
  gsm: number;
  quantity_kg: number;
  tolerance_percent: number;
  priority: "URGENT" | "NORMAL" | "STOCK";
  delivery_date?: string | null;
}

interface SolverRequestPayload {
  machines: SolverMachineInput[];
  items: SolverItemInput[];
  options?: Record<string, unknown>;
}

interface PatternCutResult {
  order_item_id: string;
  width_inch: number;
  count: number;
}

interface PatternResult {
  sequence: number;
  repetitions: number;
  run_length_m: number;
  cuts: PatternCutResult[];
  used_width_inch: number;
  trim_width_inch: number;
  trim_percent: number;
  estimated_kg: number;
  is_manually_edited: boolean;
}

interface ProductionRunResult {
  machine_id: string;
  gsm: number;
  total_trim_percent: number;
  total_planned_kg: number;
  patterns: PatternResult[];
}

interface PatternCandidate {
  cuts: { [orderItemId: string]: number };
  usedWidthInch: number;
  trimWidthInch: number;
  trimPercent: number;
}

function generateCombinations(
  items: SolverItemInput[],
  maxUsableWidth: number,
  minDeckle: number,
  minTrim: number,
  maxDeckle: number
): PatternCandidate[] {
  const patterns: PatternCandidate[] = [];
  const sorted = [...items].sort((a, b) => b.width_inch - a.width_inch);

  function search(idx: number, curW: number, curCuts: { [oid: string]: number }) {
    if (curW >= minDeckle - minTrim && curW <= maxUsableWidth) {
      const trimW = maxDeckle - curW;
      patterns.push({
        cuts: { ...curCuts },
        usedWidthInch: +curW.toFixed(2),
        trimWidthInch: +trimW.toFixed(2),
        trimPercent: +((trimW / maxDeckle) * 100).toFixed(2),
      });
    }
    if (idx >= sorted.length || patterns.length > 200) return;
    const item = sorted[idx];
    const maxC = Math.min(5, Math.floor((maxUsableWidth - curW) / item.width_inch));
    for (let c = maxC; c >= 0; c--) {
      if (c > 0) curCuts[item.order_item_id] = c;
      else delete curCuts[item.order_item_id];
      search(idx + 1, curW + c * item.width_inch, curCuts);
    }
  }
  search(0, 0, {});

  for (const it of items) {
    const reps = Math.max(1, Math.floor(maxUsableWidth / it.width_inch));
    const usedW = reps * it.width_inch;
    const trimW = maxDeckle - usedW;
    patterns.push({
      cuts: { [it.order_item_id]: reps },
      usedWidthInch: +usedW.toFixed(2),
      trimWidthInch: +trimW.toFixed(2),
      trimPercent: +((trimW / maxDeckle) * 100).toFixed(2),
    });
  }
  return patterns;
}

function optimizeForMachine(
  items: SolverItemInput[],
  machine: SolverMachineInput,
  gsm: number
): ProductionRunResult | null {
  const maxDeckle = machine.max_deckle_inch;
  const minTrim = machine.min_trim_inch;
  const maxUsable = maxDeckle - minTrim;
  const remainingKg = new Map<string, number>(items.map(it => [it.order_item_id, it.quantity_kg]));
  const itemMap = new Map<string, SolverItemInput>(items.map(it => [it.order_item_id, it]));
  const validPats = generateCombinations(items, maxUsable, machine.min_deckle_inch, minTrim, maxDeckle);
  if (!validPats.length) return null;
  validPats.sort((a, b) => a.trimPercent - b.trimPercent);

  const selected: PatternResult[] = [];
  let seq = 1, totalKg = 0;

  for (let iter = 0; iter < 20; iter++) {
    if (!Array.from(remainingKg.values()).some(kg => kg > 50)) break;
    let best: PatternCandidate | null = null;
    let bestScore = -1;
    for (const p of validPats) {
      let score = 0;
      for (const [oid, c] of Object.entries(p.cuts)) score += c * (remainingKg.get(oid) || 0);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (!best || bestScore <= 0) break;

    let reps = Infinity;
    for (const [oid, c] of Object.entries(best.cuts)) {
      const it = itemMap.get(oid)!;
      const rem = remainingKg.get(oid) || 0;
      if (it && c > 0 && rem > 0) {
        const kgPerRep = it.width_inch * 0.0254 * (gsm / 1000) * c * 1000;
        reps = Math.min(reps, Math.max(1, Math.ceil(rem / Math.max(1, kgPerRep))));
      }
    }
    if (!isFinite(reps) || reps <= 0) reps = 1;
    reps = Math.min(reps, 10);

    const cuts: PatternCutResult[] = Object.entries(best.cuts).map(([oid, c]) => ({
      order_item_id: oid,
      width_inch: itemMap.get(oid)!.width_inch,
      count: c,
    }));

    let patKg = 0;
    for (const cut of cuts) {
      const it = itemMap.get(cut.order_item_id)!;
      const kg = it.width_inch * 0.0254 * (gsm / 1000) * cut.count * 1000 * reps;
      patKg += kg;
      remainingKg.set(cut.order_item_id, Math.max(0, (remainingKg.get(cut.order_item_id) || 0) - kg));
    }
    totalKg += patKg;

    selected.push({
      sequence: seq++,
      repetitions: reps,
      run_length_m: 1000 * reps,
      cuts,
      used_width_inch: best.usedWidthInch,
      trim_width_inch: best.trimWidthInch,
      trim_percent: best.trimPercent,
      estimated_kg: Math.round(patKg),
      is_manually_edited: false,
    });
  }

  if (!selected.length) return null;
  const trimKg = selected.reduce((a, p) => a + (p.estimated_kg * p.trim_percent) / 100, 0);
  return {
    machine_id: machine.id,
    gsm,
    total_trim_percent: +(totalKg > 0 ? (trimKg / totalKg) * 100 : 0).toFixed(2),
    total_planned_kg: Math.round(totalKg),
    patterns: selected,
  };
}

function solve(req: SolverRequestPayload) {
  const t0 = Date.now();
  const runs: ProductionRunResult[] = [];
  const unassigned: Array<{ order_item_id: string; order_number?: string | null; width_inch?: number | null; gsm?: number | null; reason: string }> = [];
  const gsmMap = new Map<number, SolverItemInput[]>();
  for (const it of req.items) {
    if (!gsmMap.has(it.gsm)) gsmMap.set(it.gsm, []);
    gsmMap.get(it.gsm)!.push(it);
  }
  for (const [gsm, items] of gsmMap) {
    const eligible = req.machines.filter(m => m.min_gsm <= gsm && gsm <= m.max_gsm);
    if (!eligible.length) {
      items.forEach(it => unassigned.push({ order_item_id: it.order_item_id, order_number: it.order_number, width_inch: it.width_inch, gsm: it.gsm, reason: `No machine for GSM ${gsm}` }));
      continue;
    }
    let best: ProductionRunResult | null = null;
    for (const m of eligible) {
      const r = optimizeForMachine(items, m, gsm);
      if (r && (!best || r.total_trim_percent < best.total_trim_percent)) best = r;
    }
    if (best?.patterns.length) runs.push(best);
    else items.forEach(it => unassigned.push({ order_item_id: it.order_item_id, order_number: it.order_number, width_inch: it.width_inch, gsm: it.gsm, reason: "Cannot fit within deckle constraints" }));
  }
  const totalKg = runs.reduce((a, r) => a + r.total_planned_kg, 0);
  const avgTrim = runs.length > 0 ? +(runs.reduce((a, r) => a + r.total_trim_percent * r.total_planned_kg, 0) / Math.max(1, totalKg)).toFixed(2) : 0;
  return {
    runs,
    unassigned_items: unassigned,
    summary: { total_trim_percent: avgTrim, total_kg: Math.round(totalKg), machines_used: new Set(runs.map(r => r.machine_id)).size, runs_created: runs.length, solve_time_ms: Date.now() - t0 },
    warnings: [],
  };
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
      return new Response(JSON.stringify({ status: "ok", service: "hra-solver-worker", engine: "native-ts", version: "2.0" }), { headers: { "Content-Type": "application/json", ...CORS } });
    if (url.pathname === "/optimize" && req.method === "POST") {
      try {
        const payload = await req.json() as SolverRequestPayload;
        if (!payload?.machines?.length) return new Response(JSON.stringify({ error: "machines required" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
        if (!payload?.items?.length) return new Response(JSON.stringify({ error: "items required" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
        return new Response(JSON.stringify(solve(payload)), { headers: { "Content-Type": "application/json", ...CORS } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: "bad request", detail: e?.message }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
      }
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "Content-Type": "application/json", ...CORS } });
  },
};
