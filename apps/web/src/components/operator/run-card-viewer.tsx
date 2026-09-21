"use client";

import * as React from "react";
import { Loader2, ExternalLink } from "lucide-react";
import { generateRunCardPDFBlob } from "@/lib/pdf/generate-run-card-pdf";
import { toRunCardData } from "@/lib/pdf/run-card-data";

/**
 * Renders a run's card (the cutting diagram PDF) on screen. Loaded with
 * next/dynamic(ssr:false) so jsPDF stays in a client-only chunk.
 *
 * Some tablet browsers can't preview a PDF inside a page, so there is always a
 * large "Open full screen" button that opens the same PDF in its own tab.
 */
export default function RunCardViewer({ run }: { run: any }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let objectUrl: string | null = null;
    try {
      const blob = generateRunCardPDFBlob(toRunCardData(run));
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    } catch (err: any) {
      setError(err?.message || "Could not build the run card.");
    }
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [run]);

  if (error) {
    return <div className="p-6 text-center text-rose-300 font-bold">{error}</div>;
  }
  if (!url) {
    return (
      <div className="h-[60vh] flex items-center justify-center text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <iframe
        title={`Run card ${run.runNumber}`}
        src={url}
        className="w-full h-[70vh] rounded-2xl border-2 border-slate-700 bg-white"
      />
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-2 h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 text-white font-bold text-base"
      >
        <ExternalLink className="h-5 w-5" /> Open run card full screen
      </a>
    </div>
  );
}
