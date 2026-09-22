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
  order_date?: string | null;
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

export type SolverFetch = (input: string, init?: RequestInit) => Promise<Response>;

export async function callDeckleSolver(
  payload: SolverRequestPayload,
  timeoutMs: number = 35000,
  /**
   * Optional fetch implementation. On Cloudflare this is the `SOLVER` service
   * binding's `fetch` (a direct Worker-to-Worker call), since a normal `fetch()`
   * to the solver's workers.dev URL is rejected with error 1042. Falls back to
   * global `fetch` (local dev / preview).
   */
  fetcher?: SolverFetch
): Promise<OptimizeResponse> {
  const doFetch: SolverFetch = fetcher ?? ((input, init) => fetch(input, init));
  const solverUrl = process.env.SOLVER_SERVICE_URL || "http://localhost:8000";
  const url = `${solverUrl.replace(/\/$/, "")}/optimize`;

  let attempt = 0;
  const maxAttempts = 2;

  while (attempt < maxAttempts) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await doFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timer);

      if (!res.ok) {
        const errorText = await res.text();
        let parsedDetail = errorText;
        try {
          const errJson = JSON.parse(errorText);
          parsedDetail = errJson.detail || errorText;
        } catch {}

        if (res.status >= 500 && attempt < maxAttempts) {
          console.warn(`[SolverClient] 5xx received from solver (${res.status}). Retrying once...`);
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }

        throw new SolverError(
          `Optimization service error (${res.status}): ${parsedDetail}`,
          res.status
        );
      }

      const json = await res.json();
      const parsed = optimizeResponseSchema.safeParse(json);

      if (!parsed.success) {
        console.error("[SolverClient] Invalid response structure:", parsed.error);
        throw new SolverError(
          "Received an invalid data structure from optimization microservice.",
          500,
          parsed.error
        );
      }

      return parsed.data;
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        throw new SolverError(
          `Optimization solver timed out after ${Math.round(timeoutMs / 1000)} seconds. Try reducing items or increasing the time limit.`,
          504
        );
      }
      if (attempt >= maxAttempts || !(err instanceof SolverError && err.statusCode && err.statusCode >= 500)) {
        if (err instanceof SolverError) throw err;
        throw new SolverError(
          `Could not connect to deckle solver service at ${url}. Ensure the solver container is running. Error: ${err.message}`,
          503
        );
      }
    }
  }

  throw new SolverError("Failed to complete deckle optimization request.", 500);
}
