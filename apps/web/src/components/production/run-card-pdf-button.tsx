"use client";

import * as React from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateRunCardPDF } from "@/lib/pdf/generate-run-card-pdf";
import type { LengthUnit } from "@/generated/prisma/browser";

/**
 * Isolated so that jsPDF (~350 KB) is only ever in a client-side chunk and
 * never bundled into the Cloudflare Worker. Loaded via next/dynamic(ssr:false).
 */
export default function RunCardPdfButton({ run, unit = "INCH" as LengthUnit }: { run: any; unit?: LengthUnit }) {
  const [isGenerating, setIsGenerating] = React.useState(false);

  const handleDownloadPdf = () => {
    setIsGenerating(true);
    try {
      const patternsFormatted = run.patterns.map((pat: any) => ({
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
      }));

      generateRunCardPDF({
        runNumber: run.runNumber,
        machineName: run.machine.name,
        maxDeckleInch: Number(run.machine.maxDeckleInch),
        gsm: run.gsm,
        status: run.status,
        totalPlannedKg: Number(run.totalPlannedKg),
        totalActualKg: Number(run.totalActualKg || 0),
        totalTrimPercent: Number(run.totalTrimPercent),
        createdAt: run.createdAt,
        patterns: patternsFormatted,
        orderItems: run.orderItems || [],
        unit,
      });
      toast.success(`Run Card PDF generated for #${run.runNumber}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isGenerating}
      onClick={handleDownloadPdf}
      className="gap-1.5 text-xs font-bold shadow-sm bg-white hover:bg-slate-50 border-slate-200 text-slate-900"
    >
      {isGenerating ? (
        <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
      ) : (
        <Download className="h-4 w-4 text-sky-600" />
      )}
      Download Run Card (A4 PDF)
    </Button>
  );
}
