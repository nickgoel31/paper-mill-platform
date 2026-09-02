import { z } from "zod";

// Zod schemas matching solver response
export const patternCutSchema = z.object({
  order_item_id: z.string(),
  width_inch: z.number(),
  count: z.number(),
});

export const patternSchema = z.object({
  sequence: z.number(),
  repetitions: z.number(),
  run_length_m: z.number().default(0),  // Exact meter length from solver
  cuts: z.array(patternCutSchema),
  used_width_inch: z.number(),
  trim_width_inch: z.number(),
  trim_percent: z.number(),
  estimated_kg: z.number(),
  is_manually_edited: z.boolean().optional().default(false),
});

export const productionRunResultSchema = z.object({
  machine_id: z.string(),
  gsm: z.number(),
  total_trim_percent: z.number(),
  total_planned_kg: z.number(),
  patterns: z.array(patternSchema),
});

export const unassignedItemResultSchema = z.object({
  order_item_id: z.string(),
  order_number: z.string().optional().nullable(),
  width_inch: z.number().optional().nullable(),
  gsm: z.number().optional().nullable(),
  reason: z.string(),
});

export const solverSummarySchema = z.object({
  total_trim_percent: z.number(),
  total_kg: z.number(),
  machines_used: z.number(),
  runs_created: z.number(),
  solve_time_ms: z.number(),
});

export const optimizeResponseSchema = z.object({
  runs: z.array(productionRunResultSchema),
  unassigned_items: z.array(unassignedItemResultSchema),
  summary: solverSummarySchema,
  warnings: z.array(z.string()).default([]),
});

export type OptimizeResponse = z.infer<typeof optimizeResponseSchema>;
export type ProductionRunResult = z.infer<typeof productionRunResultSchema>;
export type PatternResult = z.infer<typeof patternSchema>;
export type PatternCutResult = z.infer<typeof patternCutSchema>;

export interface SolverMachineInput {
  id: string;
  name: string;
  max_deckle_inch: number;
  min_deckle_inch: number;
  min_trim_inch: number;
  max_trim_inch: number;
  min_gsm: number;
  max_gsm: number;
}

export interface SolverItemInput {
  order_item_id: string;
  order_number?: string | null;
  width_inch: number;
  gsm: number;
  quantity_kg: number;
  tolerance_percent: number;
  priority: "URGENT" | "NORMAL" | "STOCK";
  delivery_date?: string | null;
}

export interface SolverOptionsInput {
  objective: "MIN_TRIM" | "MIN_PATTERNS" | "BALANCED";
  max_patterns_per_run?: number;
  max_distinct_widths_per_pattern?: number;
  allow_overproduction?: boolean;
  use_stock_presets?: boolean;
  time_limit_seconds?: number;
}

export interface SolverRequestPayload {
  machines: SolverMachineInput[];
  items: SolverItemInput[];
  options?: SolverOptionsInput;
}

export class SolverError extends Error {
  constructor(message: string, public statusCode?: number, public details?: any) {
    super(message);
    this.name = "SolverError";
  }
}

import { solveCuttingStockNative } from "./solver-engine-native";

export async function callDeckleSolver(
  payload: SolverRequestPayload,
  timeoutMs: number = 10000
): Promise<OptimizeResponse> {
  const solverUrl = process.env.SOLVER_SERVICE_URL;

  // If no external URL or localhost in production edge, use fast native engine
  if (!solverUrl || solverUrl.includes("localhost") || solverUrl.includes("127.0.0.1")) {
    try {
      if (typeof fetch !== "undefined") {
        const localUrl = `${(solverUrl || "http://localhost:8000").replace(/\/$/, "")}/optimize`;
        const res = await fetch(localUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(2000),
          cache: "no-store",
        });
        if (res.ok) {
          const json = await res.json();
          const parsed = optimizeResponseSchema.safeParse(json);
          if (parsed.success) return parsed.data;
        }
      }
    } catch {
      // Local microservice offline, proceed to native solver
    }
    return solveCuttingStockNative(payload);
  }

  const url = `${solverUrl.replace(/\/$/, "")}/optimize`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timer);

    if (res.ok) {
      const json = await res.json();
      const parsed = optimizeResponseSchema.safeParse(json);
      if (parsed.success) {
        return parsed.data;
      }
    }
  } catch (err) {
    console.warn(`[DeckleSolver] External microservice at ${url} unreachable. Using native edge optimization engine.`);
  }

  // Seamless fallback to native TypeScript solver engine
  return solveCuttingStockNative(payload);
}
