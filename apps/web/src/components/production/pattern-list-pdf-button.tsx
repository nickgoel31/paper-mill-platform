"use client";

import * as React from "react";
import { toast } from "sonner";
import { ListOrdered, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generatePatternListPDF } from "@/lib/pdf/generate-pattern-list-pdf";
import type { LengthUnit } from "@/generated/prisma/browser";

/**
 * Isolated so that jsPDF (~350 KB) is only ever in a client-side chunk and
 * never bundled into the Cloudflare Worker. Loaded via next/dynamic(ssr:false).
 */
export default function PatternListPdfButton({ run, unit = "INCH" as LengthUnit }: { run: any; unit?: LengthUnit }) {
  const [isGenerating, setIsGenerating] = React.useState(false);

  const handleDownloadPdf = () => {
    setIsGenerating(true);
    try {
      const patternsFormatted = run.patterns.map((pat: any) => ({
        sequence: pat.sequence,
        repetitions: pat.repetitions,
        usedWidthInch: Number(pat.usedWidthInch),
        cuts: pat.cuts.map((c: any) => ({
          widthInch: Number(c.widthInch),
          count: c.count,
        })),
      }));

      generatePatternListPDF({
        runNumber: run.runNumber,
        machineName: run.machine.name,
        maxDeckleInch: Number(run.machine.maxDeckleInch),
        gsm: run.gsm,
        createdAt: run.createdAt,
        patterns: patternsFormatted,
        unit,
      });
      toast.success(`Pattern list PDF generated for #${run.runNumber}`);
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
        <ListOrdered className="h-4 w-4 text-sky-600" />
      )}
      Download Pattern List (PDF)
    </Button>
  );
}
