import {
  OptimizeResponse,
  SolverRequestPayload,
  SolverItemInput,
  SolverMachineInput,
  ProductionRunResult,
  PatternResult,
  PatternCutResult,
} from "./solver-client";

interface PatternCandidate {
  cuts: { [orderItemId: string]: number };
  usedWidthInch: number;
  trimWidthInch: number;
  trimPercent: number;
}

/**
 * Native cutting stock optimizer executing directly in JavaScript / Cloudflare V8 Edge runtime.
 * Guarantees 100% availability with zero external microservice dependencies.
 */
export function solveCuttingStockNative(req: SolverRequestPayload): OptimizeResponse {
  const startTime = Date.now();
  const runs: ProductionRunResult[] = [];
  const unassigned: Array<{
    order_item_id: string;
    order_number?: string | null;
    width_inch?: number | null;
    gsm?: number | null;
    reason: string;
  }> = [];
  const warnings: string[] = [];

  // 1. Group items by GSM
  const gsmGroups = new Map<number, SolverItemInput[]>();
  for (const item of req.items) {
    if (!gsmGroups.has(item.gsm)) {
      gsmGroups.set(item.gsm, []);
    }
    gsmGroups.get(item.gsm)!.push(item);
  }

  // 2. Process each GSM group
  for (const [gsm, items] of gsmGroups.entries()) {
    // Find eligible machines
    const eligibleMachines = req.machines.filter(
      (m) => m.min_gsm <= gsm && gsm <= m.max_gsm
    );

    if (eligibleMachines.length === 0) {
      for (const it of items) {
        unassigned.push({
          order_item_id: it.order_item_id,
          order_number: it.order_number,
          width_inch: it.width_inch,
          gsm: it.gsm,
          reason: `No machine configured for GSM ${gsm}`,
        });
      }
      continue;
    }

    // Pick best machine with lowest trim waste
    let bestRun: ProductionRunResult | null = null;
    let bestTrim = Infinity;

    for (const machine of eligibleMachines) {
      const runResult = optimizeGsmGroupForMachine(items, machine, gsm);
      if (runResult && runResult.total_trim_percent < bestTrim) {
        bestTrim = runResult.total_trim_percent;
        bestRun = runResult;
      }
    }

    if (bestRun && bestRun.patterns.length > 0) {
      runs.push(bestRun);
    } else {
      for (const it of items) {
        unassigned.push({
          order_item_id: it.order_item_id,
          order_number: it.order_number,
          width_inch: it.width_inch,
          gsm: it.gsm,
          reason: "Could not combine item widths within machine deckle constraints",
        });
      }
    }
  }

  const totalKg = runs.reduce((acc, r) => acc + r.total_planned_kg, 0);
  const totalTrimPct =
    runs.length > 0
      ? Number(
          (
            runs.reduce((acc, r) => acc + r.total_trim_percent * r.total_planned_kg, 0) /
            Math.max(1, totalKg)
          ).toFixed(2)
        )
      : 0;

  const usedMachines = new Set(runs.map((r) => r.machine_id));

  return {
    runs,
    unassigned_items: unassigned,
    summary: {
      total_trim_percent: totalTrimPct,
      total_kg: Math.round(totalKg),
      machines_used: usedMachines.size,
      runs_created: runs.length,
      solve_time_ms: Date.now() - startTime,
    },
    warnings,
  };
}

function optimizeGsmGroupForMachine(
  items: SolverItemInput[],
  machine: SolverMachineInput,
  gsm: number
): ProductionRunResult | null {
  const maxDeckle = machine.max_deckle_inch;
  const minTrim = machine.min_trim_inch;
  const maxUsableWidth = maxDeckle - minTrim;

  // Track remaining quantity to produce for each item
  const remainingKg = new Map<string, number>();
  const itemMap = new Map<string, SolverItemInput>();
  for (const it of items) {
    remainingKg.set(it.order_item_id, it.quantity_kg);
    itemMap.set(it.order_item_id, it);
  }

  // Generate valid pattern combinations
  const validPatterns = generateCombinations(items, maxUsableWidth, machine.min_deckle_inch, minTrim, maxDeckle);

  if (validPatterns.length === 0) {
    return null;
  }

  // Sort patterns by trim waste percentage ascending (lowest trim first)
  validPatterns.sort((a, b) => a.trimPercent - b.trimPercent);

  const selectedPatterns: PatternResult[] = [];
  let sequence = 1;
  let totalPlannedKg = 0;

  // Greedy pattern scheduling
  let iterations = 0;
  while (iterations < 20) {
    iterations++;
    // Check if remaining demand exists
    const hasRemainingDemand = Array.from(remainingKg.values()).some((kg) => kg > 50);
    if (!hasRemainingDemand) break;

    // Find best matching pattern for highest remaining demand
    let bestPattern: PatternCandidate | null = null;
    let maxMatchKg = -1;

    for (const pat of validPatterns) {
      let matchScore = 0;
      for (const [oid, count] of Object.entries(pat.cuts)) {
        const rem = remainingKg.get(oid) || 0;
        if (rem > 0) {
          matchScore += count * rem;
        }
      }

      if (matchScore > maxMatchKg) {
        maxMatchKg = matchScore;
        bestPattern = pat;
      }
    }

    if (!bestPattern || maxMatchKg <= 0) break;

    // Calculate repetitions based on remaining kg and linear roll length
    let minRepsNeeded = Infinity;
    for (const [oid, count] of Object.entries(bestPattern.cuts)) {
      const it = itemMap.get(oid);
      const rem = remainingKg.get(oid) || 0;
      if (it && count > 0 && rem > 0) {
        const widthM = it.width_inch * 0.0254;
        const kgPerMeter = widthM * (gsm / 1000) * count;
        const rollLengthM = 1000; // Standard 1000m jumbo roll section
        const kgPerRep = kgPerMeter * rollLengthM;
        const reps = Math.max(1, Math.ceil(rem / Math.max(1, kgPerRep)));
        minRepsNeeded = Math.min(minRepsNeeded, reps);
      }
    }

    if (!isFinite(minRepsNeeded) || minRepsNeeded <= 0) minRepsNeeded = 1;
    const repetitions = Math.min(minRepsNeeded, 10);

    const cuts: PatternCutResult[] = Object.entries(bestPattern.cuts).map(([oid, count]) => {
      const it = itemMap.get(oid)!;
      return {
        order_item_id: oid,
        width_inch: it.width_inch,
        count,
      };
    });

    let patternKg = 0;
    for (const cut of cuts) {
      const it = itemMap.get(cut.order_item_id)!;
      const widthM = it.width_inch * 0.0254;
      const rollLengthM = 1000 * repetitions;
      const cutKg = widthM * (gsm / 1000) * cut.count * rollLengthM;
      patternKg += cutKg;

      const currentRem = remainingKg.get(cut.order_item_id) || 0;
      remainingKg.set(cut.order_item_id, Math.max(0, currentRem - cutKg));
    }

    totalPlannedKg += patternKg;

    selectedPatterns.push({
      sequence: sequence++,
      repetitions,
      run_length_m: 1000 * repetitions,
      cuts,
      used_width_inch: bestPattern.usedWidthInch,
      trim_width_inch: bestPattern.trimWidthInch,
      trim_percent: bestPattern.trimPercent,
      estimated_kg: Math.round(patternKg),
      is_manually_edited: false,
    });
  }

  if (selectedPatterns.length === 0) return null;

  const totalTrimKg = selectedPatterns.reduce(
    (acc, p) => acc + (p.estimated_kg * p.trim_percent) / 100,
    0
  );
  const avgTrimPct = totalPlannedKg > 0 ? (totalTrimKg / totalPlannedKg) * 100 : 0;

  return {
    machine_id: machine.id,
    gsm,
    total_trim_percent: Number(avgTrimPct.toFixed(2)),
    total_planned_kg: Math.round(totalPlannedKg),
    patterns: selectedPatterns,
  };
}

function generateCombinations(
  items: SolverItemInput[],
  maxUsableWidth: number,
  minDeckle: number,
  minTrim: number,
  maxDeckle: number
): PatternCandidate[] {
  const patterns: PatternCandidate[] = [];
  const sortedItems = [...items].sort((a, b) => b.width_inch - a.width_inch);

  function search(index: number, currentWidth: number, currentCuts: { [oid: string]: number }) {
    if (currentWidth >= minDeckle - minTrim && currentWidth <= maxUsableWidth) {
      const trimWidth = maxDeckle - currentWidth;
      const trimPercent = (trimWidth / maxDeckle) * 100;
      patterns.push({
        cuts: { ...currentCuts },
        usedWidthInch: Number(currentWidth.toFixed(2)),
        trimWidthInch: Number(trimWidth.toFixed(2)),
        trimPercent: Number(trimPercent.toFixed(2)),
      });
    }

    if (index >= sortedItems.length || patterns.length > 200) return;

    const item = sortedItems[index];
    const maxCopies = Math.min(5, Math.floor((maxUsableWidth - currentWidth) / item.width_inch));

    for (let c = maxCopies; c >= 0; c--) {
      if (c > 0) {
        currentCuts[item.order_item_id] = c;
      } else {
        delete currentCuts[item.order_item_id];
      }
      search(index + 1, currentWidth + c * item.width_inch, currentCuts);
    }
  }

  search(0, 0, {});

  // Always ensure single-width base patterns exist
  for (const it of items) {
    const reps = Math.max(1, Math.floor(maxUsableWidth / it.width_inch));
    const usedWidth = reps * it.width_inch;
    const trimWidth = maxDeckle - usedWidth;
    patterns.push({
      cuts: { [it.order_item_id]: reps },
      usedWidthInch: Number(usedWidth.toFixed(2)),
      trimWidthInch: Number(trimWidth.toFixed(2)),
      trimPercent: Number(((trimWidth / maxDeckle) * 100).toFixed(2)),
    });
  }

  return patterns;
}
