import type { RunCardData } from "./generate-run-card-pdf";

/**
 * Shape a production run (as returned by `getProductionRunById`) into the data the
 * run-card PDF generator wants. Kept apart from the generator so importing it
 * doesn't pull jsPDF into a server bundle.
 */
export function toRunCardData(run: any): RunCardData {
  return {
    runNumber: run.runNumber,
    machineName: run.machine.name,
    maxDeckleInch: Number(run.machine.maxDeckleInch),
    gsm: run.gsm,
    status: run.status,
    totalPlannedKg: Number(run.totalPlannedKg),
    totalActualKg: Number(run.totalActualKg || 0),
    totalTrimPercent: Number(run.totalTrimPercent),
    createdAt: run.createdAt,
    patterns: run.patterns.map((pat: any) => ({
      sequence: pat.sequence,
      repetitions: pat.repetitions,
      usedWidthInch: Number(pat.usedWidthInch),
      trimWidthInch: Number(pat.trimWidthInch),
      trimPercent: Number(pat.trimPercent),
      estimatedKg: Number(pat.estimatedKg),
      isManuallyEdited: pat.isManuallyEdited,
      cuts: pat.cuts.map((c: any) => {
        const item = (run.orderItems || []).find((it: any) => it.id === c.orderItemId);
        const isStockPreset = !item && (!!c.stockPresetId || !c.orderItemId);
        return {
          orderItemId: c.orderItemId,
          orderNumber: item?.order?.orderNumber || (isStockPreset ? "STOCK" : undefined),
          clientName: item?.order?.client?.name || c.stockPreset?.name,
          widthInch: Number(c.widthInch),
          count: c.count,
          isStockPreset,
        };
      }),
    })),
    orderItems: run.orderItems || [],
  };
}
