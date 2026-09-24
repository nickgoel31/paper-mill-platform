"use client";

import * as React from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateDailyOrderReportPDF, type DailyOrderReportLine } from "@/lib/pdf/generate-daily-order-report-pdf";

/**
 * Isolated so that jsPDF (~350 KB) is only ever in a client-side chunk and
 * never bundled into the Cloudflare Worker. Loaded via next/dynamic(ssr:false).
 */
export default function DailyOrderReportPdfButton({
  reportDate,
  millName,
  lines,
}: {
  reportDate: string;
  millName: string;
  lines: DailyOrderReportLine[];
}) {
  const [isGenerating, setIsGenerating] = React.useState(false);

  const handleDownloadPdf = () => {
    setIsGenerating(true);
    try {
      generateDailyOrderReportPDF({ reportDate, millName, lines });
      toast.success(`Daily order backlog PDF generated for ${reportDate}.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      disabled={isGenerating || lines.length === 0}
      onClick={handleDownloadPdf}
      className="h-9 text-xs font-bold gap-1.5"
    >
      {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      Download PDF
    </Button>
  );
}
