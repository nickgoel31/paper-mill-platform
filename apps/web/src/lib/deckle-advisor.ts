/**
 * Deckle trim advisor — deterministic "what could a human still do" finder.
 *
 * The solver has already done what it can automatically. This module looks at
 * its finished plan and finds leftovers that only a person can act on: ask a
 * client for a slightly wider reel, drop an unplanned order into a pattern's
 * spare width, or shorten a run that over-produces. Every number here is
 * computed, never estimated — the AI layer only words the result.
 */

const METRES_PER_INCH = 0.0254;
/** A leftover narrower than this can't hold any real reel. */
const MIN_AVOIDABLE_INCH = 0.75;
/** Largest reel-width change we'd ever ask a client to accept. */
const MAX_WIDEN_INCH = 2;
const WIDEN_STEP_INCH = 0.25;

export interface AdvisorMachine {
  id: string;
  name: string;
  maxDeckleInch: number;
  /** Edge trim the machine physically needs; never counted as avoidable. */
  minTrimInch: number;
}

export interface AdvisorItem {
  id: string;
  orderNumber: string;
  clientName?: string | null;
  widthInch: number;
  gsm: number;
  quantityKg: number;
  tolerancePercent: number;
}

export interface AdvisorCandidate extends AdvisorItem {
  source: "PENDING_ORDER" | "STOCK_PRESET";
}

export interface AdvisorCut {
  itemId: string;
  widthInch: number;
  count: number;
}

export interface AdvisorPattern {
  sequence: number;
  repetitions: number;
  runLengthM: number;
  usedWidthInch: number;
  trimWidthInch: number;
  estimatedKg: number;
  cuts: AdvisorCut[];
}

export interface AdvisorRun {
  machine: AdvisorMachine;
  gsm: number;
  patterns: AdvisorPattern[];
}

export interface AdvisorInput {
  runs: AdvisorRun[];
  /** Items the plan was built from — needed for tolerances and order numbers. */
  planItems: AdvisorItem[];
  /** Same-GSM work that is NOT in this plan and could still ride along. */
  candidates: AdvisorCandidate[];
}

interface OpportunityBase {
  id: string;
  runIndex: number;
  patternIndex: number;
  patternSequence: number;
  /** Paper (kg) that stops being scrap / stops being run for nothing. */
  wasteSavedKg: number;
  /** Width (inch) of edge trim removed from the pattern; 0 for shorten-run. */
  trimInchSaved: number;
  trimPercentBefore: number;
  trimPercentAfter: number;
}

export interface FillGapOpportunity extends OpportunityBase {
  kind: "FILL_GAP";
  /** One or two reel widths that fit in the spare width. */
  fills: Array<{
    candidate: AdvisorCandidate;
    count: number;
    producedKg: number;
  }>;
  spareWidthInch: number;
  remainingTrimInch: number;
}

export interface WidenCutOpportunity extends OpportunityBase {
  kind: "WIDEN_CUT";
  item: AdvisorItem;
  fromWidthInch: number;
  toWidthInch: number;
  cutCount: number;
}

export interface ShortenRunOpportunity extends OpportunityBase {
  kind: "SHORTEN_RUN";
  fromRepetitions: number;
  toRepetitions: number;
  /** Items in the pattern that are over their agreed +tolerance today. */
  overproduced: Array<{ item: AdvisorItem; excessKg: number }>;
}

export type TrimOpportunity =
  | FillGapOpportunity
  | WidenCutOpportunity
  | ShortenRunOpportunity;

export interface TrimAdvice {
  opportunities: TrimOpportunity[];
  /** Waste (kg) removable across all opportunities. */
  totalWasteSavedKg: number;
  /** Percentage points of trim removable by FILL_GAP / WIDEN_CUT together. */
  trimPointsSaved: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function runLengthOf(p: AdvisorPattern): number {
  return p.runLengthM > 0 ? p.runLengthM : p.repetitions * 1000;
}

/** kg of paper in `widthInch` of web over `lengthM` metres. */
function kgFor(widthInch: number, lengthM: number, gsm: number): number {
  return widthInch * METRES_PER_INCH * lengthM * (gsm / 1000);
}

function trimPercentOf(trimInch: number, deckleInch: number): number {
  return deckleInch > 0 ? (trimInch / deckleInch) * 100 : 0;
}

function bestFillFor(
  spare: number,
  candidates: AdvisorCandidate[],
  lengthM: number,
  gsm: number
): FillGapOpportunity["fills"] {
  type Fill = FillGapOpportunity["fills"];
  const usable = candidates.filter((c) => c.widthInch > 0 && c.widthInch <= spare + 1e-9);
  let best: Fill = [];
  let bestWidth = 0;

  const producedKg = (c: AdvisorCandidate, count: number) =>
    kgFor(c.widthInch, lengthM, gsm) * count;

  const consider = (fills: Fill) => {
    const width = fills.reduce((a, f) => a + f.candidate.widthInch * f.count, 0);
    if (width > bestWidth + 1e-9) {
      best = fills;
      bestWidth = width;
    }
  };

  for (const a of usable) {
    const maxA = Math.floor((spare + 1e-9) / a.widthInch);
    for (let ca = maxA; ca >= 1; ca--) {
      consider([{ candidate: a, count: ca, producedKg: producedKg(a, ca) }]);
      const left = spare - ca * a.widthInch;
      for (const b of usable) {
        if (b.id === a.id) continue;
        const cb = Math.floor((left + 1e-9) / b.widthInch);
        if (cb >= 1) {
          consider([
            { candidate: a, count: ca, producedKg: producedKg(a, ca) },
            { candidate: b, count: cb, producedKg: producedKg(b, cb) },
          ]);
        }
      }
    }
  }
  return best;
}

/** Paper that turns into sellable product, capped at what the order will accept. */
function usefulKg(c: AdvisorCandidate, producedKg: number): number {
  if (c.source === "STOCK_PRESET" || c.quantityKg <= 0) return producedKg;
  return Math.min(producedKg, c.quantityKg * (1 + c.tolerancePercent / 100));
}

export function findTrimOpportunities(input: AdvisorInput): TrimAdvice {
  const itemById = new Map(input.planItems.map((i) => [i.id, i]));
  const opportunities: TrimOpportunity[] = [];

  let paperKgAll = 0;
  let trimKgSaved = 0;

  input.runs.forEach((run, runIndex) => {
    const { machine, gsm } = run;
    const inPlan = new Set(run.patterns.flatMap((p) => p.cuts.map((c) => c.itemId)));
    const candidates = input.candidates.filter(
      (c) => c.gsm === gsm && !inPlan.has(c.id)
    );

    // Produced kg per item across the whole run, for over/under-production checks.
    const producedByItem = new Map<string, number>();
    for (const p of run.patterns) {
      const len = runLengthOf(p);
      for (const c of p.cuts) {
        producedByItem.set(
          c.itemId,
          (producedByItem.get(c.itemId) ?? 0) + kgFor(c.widthInch, len, gsm) * c.count
        );
      }
    }

    run.patterns.forEach((pat, patternIndex) => {
      const len = runLengthOf(pat);
      paperKgAll += kgFor(machine.maxDeckleInch, len, gsm);

      const base = (savedKg: number, trimInchSaved: number) => ({
        runIndex,
        patternIndex,
        patternSequence: pat.sequence,
        wasteSavedKg: round2(savedKg),
        trimInchSaved: round2(trimInchSaved),
        trimPercentBefore: round2(trimPercentOf(pat.trimWidthInch, machine.maxDeckleInch)),
        trimPercentAfter: round2(
          trimPercentOf(pat.trimWidthInch - trimInchSaved, machine.maxDeckleInch)
        ),
      });

      // Edge trim is unavoidable; only the excess is worth chasing.
      const spare = round2(pat.trimWidthInch - machine.minTrimInch);
      let trimFix: TrimOpportunity | null = null;

      if (spare >= MIN_AVOIDABLE_INCH) {
        // (a) Drop a not-yet-planned reel into the spare width.
        const fills = bestFillFor(spare, candidates, len, gsm);
        if (fills.length > 0) {
          const filledInch = fills.reduce((a, f) => a + f.candidate.widthInch * f.count, 0);
          const saved = fills.reduce((a, f) => a + usefulKg(f.candidate, f.producedKg), 0);
          trimFix = {
            kind: "FILL_GAP",
            id: `fill-${runIndex}-${pat.sequence}`,
            ...base(saved, filledInch),
            fills: fills.map((f) => ({ ...f, producedKg: round2(f.producedKg) })),
            spareWidthInch: spare,
            remainingTrimInch: round2(pat.trimWidthInch - filledInch),
          };
        }
      }

      if (spare >= WIDEN_STEP_INCH) {
        // (b) Ask a client to take a slightly wider reel. Only worth it when it
        // saves more than the fill would (or there is no fill).
        let bestWiden: WidenCutOpportunity | null = null;
        for (const cut of pat.cuts) {
          const item = itemById.get(cut.itemId);
          if (!item || cut.count <= 0) continue;
          const delta =
            Math.floor(Math.min(spare / cut.count, MAX_WIDEN_INCH) / WIDEN_STEP_INCH) *
            WIDEN_STEP_INCH;
          if (delta < WIDEN_STEP_INCH) continue;
          const savedInch = delta * cut.count;
          const saved = kgFor(savedInch, len, gsm);
          if (!bestWiden || saved > bestWiden.wasteSavedKg) {
            bestWiden = {
              kind: "WIDEN_CUT",
              id: `widen-${runIndex}-${pat.sequence}`,
              ...base(saved, savedInch),
              item,
              fromWidthInch: cut.widthInch,
              toWidthInch: round2(cut.widthInch + delta),
              cutCount: cut.count,
            };
          }
        }
        if (bestWiden && (!trimFix || bestWiden.wasteSavedKg > trimFix.wasteSavedKg)) {
          trimFix = bestWiden;
        }
      }

      // (c) Shorten a run that makes more than the client will accept. Reps are
      // whole 1000 m units in the editor, so we only propose whole-rep cuts that
      // keep every cut at or above its ordered quantity.
      let shorten: ShortenRunOpportunity | null = null;
      let shortenCutReps = 0;
      const perRepKg = (c: AdvisorCut) =>
        kgFor(c.widthInch, len / pat.repetitions, gsm) * c.count;
      const over = pat.cuts
        .map((c) => {
          const item = itemById.get(c.itemId);
          if (!item || item.quantityKg <= 0) return null;
          const max = item.quantityKg * (1 + item.tolerancePercent / 100);
          const excess = (producedByItem.get(item.id) ?? 0) - max;
          return excess > 1 ? { item, excessKg: round2(excess) } : null;
        })
        .filter((x): x is { item: AdvisorItem; excessKg: number } => x !== null);

      if (over.length > 0 && pat.repetitions > 1) {
        for (let k = 1; k < pat.repetitions; k++) {
          const safe = pat.cuts.every((c) => {
            const item = itemById.get(c.itemId);
            if (!item || item.quantityKg <= 0) return true;
            return (producedByItem.get(item.id) ?? 0) - k * perRepKg(c) >= item.quantityKg;
          });
          if (!safe) break;
          shortenCutReps = k;
        }
        if (shortenCutReps > 0) {
          const savedKg =
            pat.cuts.reduce((a, c) => a + shortenCutReps * perRepKg(c), 0) +
            kgFor(pat.trimWidthInch, (len / pat.repetitions) * shortenCutReps, gsm);
          shorten = {
            kind: "SHORTEN_RUN",
            id: `shorten-${runIndex}-${pat.sequence}`,
            ...base(savedKg, 0),
            fromRepetitions: pat.repetitions,
            toRepetitions: pat.repetitions - shortenCutReps,
            overproduced: over,
          };
        }
      }

      // One suggestion per pattern: fills/widening and shortening act on the
      // same paper, so adding them would double-count.
      if (shorten && (!trimFix || shorten.wasteSavedKg > trimFix.wasteSavedKg)) {
        // Later patterns must see this cut, or two suggestions could stack
        // into a shortfall on a shared item.
        for (const c of pat.cuts) {
          producedByItem.set(
            c.itemId,
            (producedByItem.get(c.itemId) ?? 0) - shortenCutReps * perRepKg(c)
          );
        }
        opportunities.push(shorten);
      } else if (trimFix) {
        opportunities.push(trimFix);
        trimKgSaved += kgFor(trimFix.trimInchSaved, len, gsm);
      }
    });
  });

  opportunities.sort((a, b) => b.wasteSavedKg - a.wasteSavedKg);

  return {
    opportunities,
    totalWasteSavedKg: round2(opportunities.reduce((a, o) => a + o.wasteSavedKg, 0)),
    trimPointsSaved: paperKgAll > 0 ? round2((trimKgSaved / paperKgAll) * 100) : 0,
  };
}
