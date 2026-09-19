/**
 * HRA Paper Mill — cutting-stock engine (column generation over an LP master).
 *
 * Paper-mill run length is effectively continuous, so the classic continuous
 * cutting-stock LP is the right model: choose how many metres to run of each
 * knife pattern so every order gets (at least) its quantity with as little
 * mother-reel paper as possible. Trim and overproduction both show up as extra
 * metres, so minimising total run length minimises both at once.
 *
 *   master : min Σ x_p  (+ BIG · shortfall)   s.t.  lo_i ≤ Σ a_ip x_p ≤ hi_i
 *   pricing: bounded-distinct-widths knapsack DP over exact widths
 *   finish : round runs up to whole metres, prune tiny patterns within a budget
 *
 * Pure TypeScript, no dependencies. Cloudflare Workers freeze `Date.now()` while
 * CPU-bound code runs, so every limit here is an iteration cap, never a timer.
 */

// ---------------------------------------------------------------------------
// Public types (wire format shared with apps/web/src/lib/solver-client.ts)
// ---------------------------------------------------------------------------

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

export interface SolverOptions {
  objective?: "MIN_TRIM" | "MIN_PATTERNS" | "BALANCED";
  max_patterns_per_run?: number;
  max_distinct_widths_per_pattern?: number;
  allow_overproduction?: boolean;
  use_stock_presets?: boolean;
  time_limit_seconds?: number;
}

export interface SolverRequestPayload {
  machines: SolverMachineInput[];
  items: SolverItemInput[];
  options?: SolverOptions;
}

export interface PatternCutResult {
  order_item_id: string;
  width_inch: number;
  count: number;
}

export interface PatternResult {
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

export interface ProductionRunResult {
  machine_id: string;
  gsm: number;
  total_trim_percent: number;
  total_planned_kg: number;
  patterns: PatternResult[];
}

export interface UnassignedResult {
  order_item_id: string;
  order_number?: string | null;
  width_inch?: number | null;
  gsm?: number | null;
  reason: string;
}

export interface SolverResponse {
  runs: ProductionRunResult[];
  unassigned_items: UnassignedResult[];
  summary: {
    total_trim_percent: number;
    total_kg: number;
    machines_used: number;
    runs_created: number;
    solve_time_ms: number;
  };
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INCH_M = 0.0254;
/** Widths are handled as integer hundredths of an inch. */
const SCALE = 100;
/** Penalty per metre of unmet demand — must dwarf any real pattern cost (≤ 1/m). */
const BIG = 1e4;
/** Credit (as a share of a pattern's per-metre cost) for filling spare width with stock reels. */
const STOCK_CREDIT = 0.25;
const MAX_CG_ITERATIONS = 300;
const MAX_DP_WIDTH_UNITS = 3000;
/** Shortfall (cut-metres) below which an item counts as fully covered. */
const SHORTFALL_EPS = 0.5;
const MAX_PRUNE_SOLVES = 60;

/** Extra run length (fraction of the optimum) each objective will trade for fewer patterns. */
const PRUNE_BUDGET: Record<NonNullable<SolverOptions["objective"]>, number> = {
  MIN_TRIM: 0.0005,
  BALANCED: 0.015,
  MIN_PATTERNS: 0.05,
};

// ---------------------------------------------------------------------------
// Internal model
// ---------------------------------------------------------------------------

interface WorkItem {
  input: SolverItemInput;
  widthInt: number;
  isStock: boolean;
  /** Row index in the master LP; -1 for stock reels (no demand row). */
  demandIdx: number;
  /** Cut-metres required (lo) and permitted (hi). */
  loM: number;
  hiM: number;
}

interface Pat {
  /** Cuts per work item (same order as the item list). */
  counts: number[];
  usedInt: number;
  key: string;
}

interface GroupContext {
  items: WorkItem[];
  demandItems: WorkItem[];
  deckleInt: number;
  usableMaxInt: number;
  maxDistinct: number;
}

// ---------------------------------------------------------------------------
// Revised simplex (dense, small)
// ---------------------------------------------------------------------------

class Lp {
  private readonly m: number;
  private readonly rhs: number[];
  private cols: Float64Array[] = [];
  private cost: number[] = [];
  private basis: number[];
  private isBasic: boolean[] = [];
  private binv: Float64Array[];
  private xB: Float64Array;
  private pivots = 0;

  /** Column indices of the shortfall variables (one per demand row). */
  readonly shortfallCols: number[] = [];

  constructor(private readonly nd: number, lo: number[], hi: number[]) {
    this.m = 2 * nd;
    this.rhs = [...lo, ...hi];
    this.basis = new Array(this.m);
    this.binv = Array.from({ length: this.m }, (_, i) => {
      const r = new Float64Array(this.m);
      r[i] = 1;
      return r;
    });
    this.xB = Float64Array.from(this.rhs);

    for (let k = 0; k < nd; k++) {
      // surplus s_k:  Σ a x − s_k = lo_k
      this.addRaw(unit(this.m, k, -1), 0);
    }
    for (let k = 0; k < nd; k++) {
      // shortfall u_k: Σ a x + u_k − s_k = lo_k   (initial basis, penalised)
      this.shortfallCols.push(this.addRaw(unit(this.m, k, 1), BIG));
      this.basis[k] = this.cols.length - 1;
      this.isBasic[this.cols.length - 1] = true;
    }
    for (let k = 0; k < nd; k++) {
      // slack t_k:    Σ a x + t_k = hi_k
      this.addRaw(unit(this.m, nd + k, 1), 0);
      this.basis[nd + k] = this.cols.length - 1;
      this.isBasic[this.cols.length - 1] = true;
    }
  }

  private addRaw(col: Float64Array, cost: number): number {
    this.cols.push(col);
    this.cost.push(cost);
    this.isBasic.push(false);
    return this.cols.length - 1;
  }

  /** Add a pattern column; `a[k]` is the cuts of demand item k. Returns its column index. */
  addPattern(a: number[], cost: number): number {
    const col = new Float64Array(this.m);
    for (let k = 0; k < this.nd; k++) {
      col[k] = a[k];
      col[this.nd + k] = a[k];
    }
    return this.addRaw(col, cost);
  }

  /** Duals combined per demand item: π_k = y(lo row) + y(hi row). */
  duals(): number[] {
    const y = this.rowDuals();
    const pi: number[] = [];
    for (let k = 0; k < this.nd; k++) pi.push(y[k] + y[this.nd + k]);
    return pi;
  }

  private rowDuals(): Float64Array {
    const y = new Float64Array(this.m);
    for (let i = 0; i < this.m; i++) {
      const cb = this.cost[this.basis[i]];
      if (cb === 0) continue;
      const row = this.binv[i];
      for (let j = 0; j < this.m; j++) y[j] += cb * row[j];
    }
    return y;
  }

  value(col: number): number {
    for (let i = 0; i < this.m; i++) if (this.basis[i] === col) return Math.max(0, this.xB[i]);
    return 0;
  }

  objective(): number {
    let z = 0;
    for (let i = 0; i < this.m; i++) z += this.cost[this.basis[i]] * this.xB[i];
    return z;
  }

  /** Primal simplex from the current (feasible) basis. Returns false only if it hits the iteration cap. */
  solve(maxIter = 20000): boolean {
    let degenerate = 0;
    for (let iter = 0; iter < maxIter; iter++) {
      const y = this.rowDuals();

      let enter = -1;
      let best = -1e-9;
      const bland = degenerate > 40;
      for (let q = 0; q < this.cols.length; q++) {
        if (this.isBasic[q]) continue;
        const col = this.cols[q];
        let rc = this.cost[q];
        for (let r = 0; r < this.m; r++) if (col[r] !== 0) rc -= y[r] * col[r];
        if (rc < best) {
          best = rc;
          enter = q;
          if (bland) break;
        }
      }
      if (enter < 0) return true;

      const col = this.cols[enter];
      const d = new Float64Array(this.m);
      for (let i = 0; i < this.m; i++) {
        const row = this.binv[i];
        let s = 0;
        for (let r = 0; r < this.m; r++) if (col[r] !== 0) s += row[r] * col[r];
        d[i] = s;
      }

      let leave = -1;
      let minRatio = Infinity;
      for (let i = 0; i < this.m; i++) {
        if (d[i] > 1e-9) {
          const ratio = Math.max(0, this.xB[i]) / d[i];
          if (
            ratio < minRatio - 1e-12 ||
            (Math.abs(ratio - minRatio) <= 1e-12 && leave >= 0 && this.basis[i] < this.basis[leave])
          ) {
            minRatio = ratio;
            leave = i;
          }
        }
      }
      if (leave < 0) return false; // unbounded — cannot happen with the shortfall columns

      degenerate = minRatio < 1e-9 ? degenerate + 1 : 0;

      const piv = d[leave];
      const lrow = this.binv[leave];
      for (let j = 0; j < this.m; j++) lrow[j] /= piv;
      this.xB[leave] /= piv;
      for (let i = 0; i < this.m; i++) {
        if (i === leave || d[i] === 0) continue;
        const f = d[i];
        const row = this.binv[i];
        for (let j = 0; j < this.m; j++) row[j] -= f * lrow[j];
        this.xB[i] -= f * this.xB[leave];
      }
      this.isBasic[this.basis[leave]] = false;
      this.basis[leave] = enter;
      this.isBasic[enter] = true;

      if (++this.pivots % 100 === 0) this.refactor();
    }
    return false;
  }

  /** Rebuild B⁻¹ from scratch to shed accumulated rounding error. */
  private refactor() {
    const m = this.m;
    const a: Float64Array[] = Array.from({ length: m }, (_, i) => {
      const row = new Float64Array(2 * m);
      for (let j = 0; j < m; j++) row[j] = this.cols[this.basis[j]][i];
      row[m + i] = 1;
      return row;
    });
    for (let c = 0; c < m; c++) {
      let p = c;
      for (let r = c + 1; r < m; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
      if (Math.abs(a[p][c]) < 1e-12) return; // singular — keep the existing inverse
      [a[c], a[p]] = [a[p], a[c]];
      const pv = a[c][c];
      for (let j = 0; j < 2 * m; j++) a[c][j] /= pv;
      for (let r = 0; r < m; r++) {
        if (r === c || a[r][c] === 0) continue;
        const f = a[r][c];
        for (let j = 0; j < 2 * m; j++) a[r][j] -= f * a[c][j];
      }
    }
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) this.binv[i][j] = a[i][m + j];
    for (let i = 0; i < m; i++) {
      let s = 0;
      for (let j = 0; j < m; j++) s += this.binv[i][j] * this.rhs[j];
      this.xB[i] = Math.max(0, s);
    }
  }
}

function unit(m: number, at: number, v: number): Float64Array {
  const c = new Float64Array(m);
  c[at] = v;
  return c;
}

// ---------------------------------------------------------------------------
// Pricing: best pattern for the current duals
// ---------------------------------------------------------------------------

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * Maximise Σ profit_i · c_i over patterns with used width in [minInt, usableMaxInt]
 * and at most `maxDistinct` different items. Exact when widths share a grid; on a very
 * fine grid widths are rounded UP to a coarser one (conservative) and re-checked.
 */
function priceOut(
  items: WorkItem[],
  profit: number[],
  usableMaxInt: number,
  minInt: number,
  maxDistinct: number
): { counts: number[]; usedInt: number; value: number } | null {
  const n = items.length;
  const cand = items.map((_, i) => i).filter((i) => items[i].widthInt <= usableMaxInt);
  if (cand.length === 0) return null;

  let g = 0;
  for (const i of cand) g = gcd(g, items[i].widthInt);
  let unitInt = Math.max(1, g);
  let maxIdx = Math.floor(usableMaxInt / unitInt);
  if (maxIdx > MAX_DP_WIDTH_UNITS) {
    unitInt = g * Math.ceil(maxIdx / MAX_DP_WIDTH_UNITS);
    maxIdx = Math.floor(usableMaxInt / unitInt);
  }
  const minIdx = Math.max(1, Math.ceil(minInt / unitInt));
  if (minIdx > maxIdx) return null;

  const K = Math.min(maxDistinct, cand.length);
  const W = maxIdx;
  const stride = W + 1;
  const layer = (K + 1) * stride;
  const NEG = -Infinity;

  let cur = new Float64Array(layer).fill(NEG);
  let next = new Float64Array(layer);
  for (let k = 0; k <= K; k++) cur[k * stride] = 0;

  const useFlag = new Uint8Array(cand.length * layer);
  const extFlag = new Uint8Array(cand.length * layer);
  const H = new Float64Array(layer);

  for (let s = 0; s < cand.length; s++) {
    const wq = Math.ceil(items[cand[s]].widthInt / unitInt);
    const p = profit[cand[s]];
    const base = s * layer;
    next.set(cur);
    H.fill(NEG);
    for (let k = 1; k <= K; k++) {
      const kRow = k * stride;
      const prevRow = (k - 1) * stride;
      for (let w = wq; w <= W; w++) {
        const start = cur[prevRow + w - wq];
        const ext = w - wq >= wq ? H[kRow + w - wq] : NEG;
        let h: number;
        if (ext > start) {
          h = ext + p;
          extFlag[base + kRow + w] = 1;
        } else {
          h = start + p;
        }
        if (h === NEG || Number.isNaN(h)) continue;
        H[kRow + w] = h;
        if (h > cur[kRow + w]) {
          next[kRow + w] = h;
          useFlag[base + kRow + w] = 1;
        }
      }
    }
    [cur, next] = [next, cur];
  }

  let bestW = -1;
  let bestV = NEG;
  for (let w = minIdx; w <= maxIdx; w++) {
    const v = cur[K * stride + w];
    if (v > NEG && v >= bestV - 1e-12) {
      bestV = v;
      bestW = w;
    }
  }
  if (bestW < 0) return null;

  const counts = new Array(n).fill(0);
  let k = K;
  let w = bestW;
  for (let s = cand.length - 1; s >= 0; s--) {
    const base = s * layer;
    if (!useFlag[base + k * stride + w]) continue;
    const wq = Math.ceil(items[cand[s]].widthInt / unitInt);
    let c = 0;
    let ww = w;
    for (;;) {
      c++;
      if (extFlag[base + k * stride + ww]) {
        ww -= wq;
      } else {
        ww -= wq;
        k--;
        break;
      }
    }
    counts[cand[s]] = c;
    w = ww;
  }

  let usedInt = 0;
  for (let i = 0; i < n; i++) usedInt += counts[i] * items[i].widthInt;
  if (usedInt > usableMaxInt || usedInt < minInt || usedInt <= 0) return null;
  return { counts, usedInt, value: bestV };
}

// ---------------------------------------------------------------------------
// Column generation for one (GSM group, machine)
// ---------------------------------------------------------------------------

function patKey(counts: number[]): string {
  return counts.join(",");
}

function patternCost(ctx: GroupContext, counts: number[]): number {
  let stockInt = 0;
  ctx.items.forEach((it, i) => {
    if (it.isStock) stockInt += counts[i] * it.widthInt;
  });
  return 1 - (STOCK_CREDIT * stockInt) / ctx.deckleInt;
}

function demandCounts(ctx: GroupContext, counts: number[]): number[] {
  return ctx.demandItems.map((d) => counts[ctx.items.indexOf(d)]);
}

interface LpSolution {
  /** Every column the LP was solved over (aligned with `lengths`). */
  patterns: Pat[];
  lengths: number[];
  /** Uncovered cut-metres per demand item. */
  shortfall: number[];
  /** Total (cost-weighted) run metres, excluding the shortfall penalty. */
  objective: number;
}

function extract(ctx: GroupContext, lp: Lp, patterns: Pat[], patCols: number[]): LpSolution {
  const lengths = patCols.map((c) => lp.value(c));
  return {
    patterns,
    lengths,
    shortfall: lp.shortfallCols.map((c) => lp.value(c)),
    objective: lengths.reduce((a, len, i) => a + len * patternCost(ctx, patterns[i].counts), 0),
  };
}

function newLp(ctx: GroupContext): Lp {
  return new Lp(
    ctx.demandItems.length,
    ctx.demandItems.map((d) => d.loM),
    ctx.demandItems.map((d) => d.hiM)
  );
}

function columnGeneration(ctx: GroupContext, minUsedInt: number): LpSolution {
  const lp = newLp(ctx);
  const patterns: Pat[] = [];
  const patCols: number[] = [];
  const seen = new Set<string>();

  for (let iter = 0; iter < MAX_CG_ITERATIONS; iter++) {
    lp.solve();
    const pi = lp.duals();
    const profit = ctx.items.map((it) =>
      it.isStock ? (STOCK_CREDIT * it.widthInt) / ctx.deckleInt : pi[it.demandIdx]
    );
    const found = priceOut(ctx.items, profit, ctx.usableMaxInt, minUsedInt, ctx.maxDistinct);
    if (!found) break;

    const cost = patternCost(ctx, found.counts);
    // Reduced cost = cost − Σ π·a − stock credit already folded into `cost`.
    let dual = 0;
    ctx.items.forEach((it, i) => {
      if (!it.isStock) dual += pi[it.demandIdx] * found.counts[i];
    });
    if (cost - dual >= -1e-7) break;

    const key = patKey(found.counts);
    if (seen.has(key)) break;
    seen.add(key);
    const pat: Pat = { counts: found.counts, usedInt: found.usedInt, key };
    patterns.push(pat);
    patCols.push(lp.addPattern(demandCounts(ctx, found.counts), cost));
  }
  lp.solve();
  return extract(ctx, lp, patterns, patCols);
}

/** Re-solve the master over a fixed set of patterns (no pricing). */
function solveFixed(ctx: GroupContext, patterns: Pat[]): LpSolution {
  const lp = newLp(ctx);
  const cols = patterns.map((p) => lp.addPattern(demandCounts(ctx, p.counts), patternCost(ctx, p.counts)));
  lp.solve();
  return extract(ctx, lp, patterns, cols);
}

function isCovered(ctx: GroupContext, sol: LpSolution): boolean {
  return ctx.demandItems.every((_, k) => sol.shortfall[k] <= SHORTFALL_EPS);
}

function activeOf(sol: LpSolution) {
  return sol.patterns
    .map((p, i) => ({ p, len: sol.lengths[i] }))
    .filter((x) => x.len > 1e-6);
}

/**
 * Fewer knife setups. Re-solves the master over the whole column pool with one
 * short pattern banned, and keeps the result if it uses fewer patterns without
 * costing more than the objective's budget (or if the max-pattern cap forces it).
 */
function prune(
  ctx: GroupContext,
  base: LpSolution,
  objective: NonNullable<SolverOptions["objective"]>,
  maxPatterns: number
): { sol: LpSolution; capMissed: boolean } {
  const pool = base.patterns;
  const baseObj = base.objective;
  const budget = baseObj * PRUNE_BUDGET[objective];
  const banned = new Set<string>();
  const tried = new Set<string>();
  let current = base;
  let solves = 0;

  outer: for (;;) {
    const active = activeOf(current).sort((x, y) => x.len - y.len);
    if (active.length <= 1) break;
    const forced = active.length > maxPatterns;

    for (const victim of active.slice(0, 8)) {
      if (tried.has(victim.p.key)) continue;
      if (solves++ >= MAX_PRUNE_SOLVES) break outer;

      const sub = pool.filter((p) => !banned.has(p.key) && p.key !== victim.p.key);
      const s = solveFixed(ctx, sub);
      const fewer = activeOf(s).length < active.length;
      const affordable = forced || s.objective - baseObj <= budget;
      if (fewer && affordable && isCovered(ctx, s)) {
        banned.add(victim.p.key);
        current = s;
        tried.clear();
        continue outer;
      }
      tried.add(victim.p.key);
    }
    break;
  }
  return { sol: current, capMissed: activeOf(current).length > maxPatterns };
}

// ---------------------------------------------------------------------------
// One run: (GSM group, machine) → ProductionRunResult
// ---------------------------------------------------------------------------

interface RunAttempt {
  run: ProductionRunResult;
  /** Items fully served by this run (order_item_id). */
  covered: Set<string>;
  paperKg: number;
  servedDemandKg: number;
  warnings: string[];
}

function buildContext(
  group: SolverItemInput[],
  machine: SolverMachineInput,
  gsm: number,
  opts: Required<Pick<SolverOptions, "allow_overproduction" | "max_distinct_widths_per_pattern">>
): GroupContext | null {
  const deckleInt = Math.round(machine.max_deckle_inch * SCALE);
  const usableMaxInt = deckleInt - Math.round(machine.min_trim_inch * SCALE);

  const items: WorkItem[] = [];
  for (const input of group) {
    const widthInt = Math.round(input.width_inch * SCALE);
    if (widthInt <= 0 || widthInt > usableMaxInt) continue;
    const isStock = input.priority === "STOCK" || !(input.quantity_kg > 0);
    const kgPerCutM = input.width_inch * INCH_M * (gsm / 1000);
    const loM = isStock ? 0 : input.quantity_kg / kgPerCutM;
    const tol = Math.max(0, input.tolerance_percent) / 100;
    const hiM = isStock ? 0 : opts.allow_overproduction ? loM * (1 + tol) + 1 : loM + 1;
    items.push({ input, widthInt, isStock, demandIdx: -1, loM, hiM });
  }
  // Wide reels first: gives the DP (and ties) a stable, sensible order.
  items.sort((a, b) => b.widthInt - a.widthInt);
  const demandItems = items.filter((i) => !i.isStock);
  if (demandItems.length === 0) return null;
  demandItems.forEach((d, k) => (d.demandIdx = k));

  return {
    items,
    demandItems,
    deckleInt,
    usableMaxInt,
    maxDistinct: Math.max(1, opts.max_distinct_widths_per_pattern),
  };
}

function attemptRun(
  group: SolverItemInput[],
  machine: SolverMachineInput,
  gsm: number,
  options: Required<Omit<SolverOptions, "time_limit_seconds" | "use_stock_presets">>
): RunAttempt | null {
  const ctx = buildContext(group, machine, gsm, options);
  if (!ctx) return null;

  const strictMin = Math.max(1, ctx.deckleInt - Math.round(machine.max_trim_inch * SCALE));
  let sol = columnGeneration(ctx, strictMin);
  let relaxed = false;
  if (!isCovered(ctx, sol)) {
    // The machine's max-trim rule cannot serve every order; allow higher-trim
    // patterns (each is flagged below) rather than refuse the work.
    sol = columnGeneration(ctx, 1);
    relaxed = true;
  }

  const pruned = prune(ctx, sol, options.objective, options.max_patterns_per_run);
  sol = pruned.sol;

  const covered = new Set<string>();
  ctx.demandItems.forEach((d, k) => {
    if (sol.shortfall[k] <= SHORTFALL_EPS) covered.add(d.input.order_item_id);
  });
  if (covered.size === 0) return null;

  // Round each run up to whole metres (never below the optimum, so demand still holds).
  const live = activeOf(sol)
    .map((x) => ({ p: x.p, len: Math.ceil(x.len - 1e-6) }))
    .filter((x) => x.len >= 1);
  if (live.length === 0) return null;

  const deckleInch = ctx.deckleInt / SCALE;
  const warnings: string[] = [];
  const patterns: PatternResult[] = [];
  let trimArea = 0;
  let deckleArea = 0;
  let totalKg = 0;
  let paperKg = 0;

  for (const { p, len } of live) {
    const cuts: PatternCutResult[] = [];
    let patKg = 0;
    ctx.items.forEach((it, i) => {
      const count = p.counts[i];
      if (count > 0) {
        cuts.push({ order_item_id: it.input.order_item_id, width_inch: it.input.width_inch, count });
        patKg += it.input.width_inch * INCH_M * len * (gsm / 1000) * count;
      }
    });
    const usedInch = p.usedInt / SCALE;
    const trimInch = deckleInch - usedInch;
    trimArea += trimInch * len;
    deckleArea += deckleInch * len;
    totalKg += patKg;
    paperKg += deckleInch * INCH_M * len * (gsm / 1000);

    // One "repetition" ≈ one 1000 m roll section, as the operator screens count them.
    const reps = Math.max(1, Math.round(len / 1000));
    patterns.push({
      sequence: 0,
      repetitions: reps,
      run_length_m: len,
      cuts,
      used_width_inch: round2(usedInch),
      trim_width_inch: round2(trimInch),
      trim_percent: round2((trimInch / deckleInch) * 100),
      estimated_kg: round2(patKg),
      is_manually_edited: false,
    });
  }

  if (pruned.capMissed) {
    warnings.push(
      `${machine.name} (GSM ${gsm}): needs ${live.length} patterns; could not get down to the requested maximum of ${options.max_patterns_per_run} without leaving orders unmet.`
    );
  }
  if (relaxed) {
    const worst = patterns.filter((p) => p.trim_width_inch > machine.max_trim_inch + 0.005);
    if (worst.length > 0) {
      warnings.push(
        `${machine.name} (GSM ${gsm}): ${worst.length} pattern(s) exceed the ${machine.max_trim_inch}" max trim because these widths cannot be combined any tighter.`
      );
    }
  }

  const priorityOf = new Map(group.map((g) => [g.order_item_id, g]));
  const rank = (p: PatternResult) => {
    let urgent = 0;
    let earliest = Infinity;
    for (const c of p.cuts) {
      const it = priorityOf.get(c.order_item_id);
      if (it?.priority === "URGENT") urgent = 1;
      const t = it?.delivery_date ? Date.parse(it.delivery_date) : NaN;
      if (!Number.isNaN(t) && t < earliest) earliest = t;
    }
    return { urgent, earliest };
  };
  patterns.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra.urgent !== rb.urgent) return rb.urgent - ra.urgent;
    if (ra.earliest !== rb.earliest) return ra.earliest - rb.earliest;
    return b.run_length_m - a.run_length_m;
  });
  patterns.forEach((p, i) => (p.sequence = i + 1));

  let servedDemandKg = 0;
  for (const d of ctx.demandItems) if (covered.has(d.input.order_item_id)) servedDemandKg += d.input.quantity_kg;

  return {
    run: {
      machine_id: machine.id,
      gsm,
      total_trim_percent: deckleArea > 0 ? round2((trimArea / deckleArea) * 100) : 0,
      total_planned_kg: round2(totalKg),
      patterns,
    },
    covered,
    paperKg,
    servedDemandKg,
    warnings,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function solve(req: SolverRequestPayload): SolverResponse {
  const t0 = Date.now();
  const o = req.options ?? {};
  const options = {
    objective: o.objective ?? "MIN_TRIM",
    max_patterns_per_run: Math.max(1, o.max_patterns_per_run ?? 20),
    max_distinct_widths_per_pattern: Math.max(1, o.max_distinct_widths_per_pattern ?? 6),
    allow_overproduction: o.allow_overproduction ?? true,
  } as const;

  const runs: ProductionRunResult[] = [];
  const unassigned: UnassignedResult[] = [];
  const warnings: string[] = [];

  const unassign = (it: SolverItemInput, reason: string) =>
    unassigned.push({
      order_item_id: it.order_item_id,
      order_number: it.order_number,
      width_inch: it.width_inch,
      gsm: it.gsm,
      reason,
    });

  const maxDeckle = req.machines.length ? Math.max(...req.machines.map((m) => m.max_deckle_inch)) : 0;

  const byGsm = new Map<number, SolverItemInput[]>();
  for (const it of req.items) {
    if (!byGsm.has(it.gsm)) byGsm.set(it.gsm, []);
    byGsm.get(it.gsm)!.push(it);
  }

  for (const [gsm, group] of byGsm) {
    const demand = group.filter((i) => i.priority !== "STOCK" && i.quantity_kg > 0);
    if (demand.length === 0) continue; // stock-only groups have nothing to plan

    const eligible = req.machines.filter((m) => m.min_gsm <= gsm && gsm <= m.max_gsm);
    if (eligible.length === 0) {
      demand.forEach((it) => unassign(it, `No machine configured for GSM ${gsm}`));
      continue;
    }

    let remaining = group;
    let machines = eligible;
    // A GSM may need more than one machine when some widths only fit the wider one.
    while (machines.length > 0) {
      const stillDemand = remaining.filter((i) => i.priority !== "STOCK" && i.quantity_kg > 0);
      if (stillDemand.length === 0) break;

      let best: RunAttempt | null = null;
      let bestMachine: SolverMachineInput | null = null;
      for (const m of machines) {
        const attempt = attemptRun(remaining, m, gsm, options);
        if (!attempt) continue;
        const better =
          !best ||
          attempt.servedDemandKg > best.servedDemandKg + 1e-6 ||
          (Math.abs(attempt.servedDemandKg - best.servedDemandKg) <= 1e-6 &&
            attempt.paperKg < best.paperKg);
        if (better) {
          best = attempt;
          bestMachine = m;
        }
      }
      if (!best || !bestMachine) break;

      runs.push(best.run);
      warnings.push(...best.warnings);
      if (eligible.length > 1) {
        warnings.push(
          `GSM ${gsm} planned on ${bestMachine.name}: ${best.run.total_trim_percent}% trim, ${best.run.patterns.length} pattern(s).`
        );
      }
      const used = bestMachine;
      machines = machines.filter((m) => m.id !== used.id);
      remaining = remaining.filter(
        (i) => i.priority === "STOCK" || !best!.covered.has(i.order_item_id)
      );
    }

    for (const it of remaining) {
      if (it.priority === "STOCK" || !(it.quantity_kg > 0)) continue;
      if (it.width_inch > maxDeckle) {
        unassign(it, `Width ${it.width_inch}" exceeds the widest machine deckle of ${maxDeckle}".`);
      } else {
        unassign(it, "Could not fit this width on any eligible machine within its deckle and edge-trim limits.");
      }
    }
  }

  const totalKg = runs.reduce((a, r) => a + r.total_planned_kg, 0);
  const trimNumer = runs.reduce((a, r) => a + r.total_trim_percent * r.total_planned_kg, 0);
  return {
    runs,
    unassigned_items: unassigned,
    summary: {
      total_trim_percent: runs.length ? round2(trimNumer / Math.max(1, totalKg)) : 0,
      total_kg: Math.round(totalKg),
      machines_used: new Set(runs.map((r) => r.machine_id)).size,
      runs_created: runs.length,
      solve_time_ms: Date.now() - t0,
    },
    warnings,
  };
}
