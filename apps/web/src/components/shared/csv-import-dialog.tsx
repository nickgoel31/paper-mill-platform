"use client";

import * as React from "react";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { csvToObjects, CsvImportResult } from "@/lib/csv";

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  requiredColumns: string[];
  optionalColumns?: string[];
  onImport: (rows: Record<string, string>[]) => Promise<CsvImportResult>;
  /** Called after a successful import so the caller can refresh its list. */
  onDone?: () => void;
}

export function CsvImportDialog({
  open,
  onOpenChange,
  title,
  description,
  requiredColumns,
  optionalColumns = [],
  onImport,
  onDone,
}: CsvImportDialogProps) {
  const [isImporting, setIsImporting] = React.useState(false);
  const [result, setResult] = React.useState<CsvImportResult | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setResult(null);
    setIsImporting(true);
    try {
      const text = await file.text();
      const rows = csvToObjects(text);
      if (rows.length === 0) {
        toast.error("The CSV file has no data rows.");
        return;
      }
      const res = await onImport(rows);
      setResult(res);
      if (res.created > 0) {
        toast.success(`Imported ${res.created} row(s).`);
        onDone?.();
      }
      if (res.errors.length > 0) {
        toast.warning(`${res.errors.length} row(s) had errors — see details below.`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to import CSV file.");
    } finally {
      setIsImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setResult(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Upload className="h-5 w-5 text-sky-500" /> {title}
          </DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
            <p className="font-bold text-slate-700">Required columns:</p>
            <p className="font-mono text-slate-600">{requiredColumns.join(", ")}</p>
            {optionalColumns.length > 0 && (
              <>
                <p className="font-bold text-slate-700 pt-1">Optional columns:</p>
                <p className="font-mono text-slate-500">{optionalColumns.join(", ")}</p>
              </>
            )}
            <p className="text-slate-400 pt-1">
              First row must be column headers, exactly as named above.
            </p>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            disabled={isImporting}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="block w-full text-xs file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:text-xs file:font-bold file:cursor-pointer cursor-pointer"
          />

          {isImporting && (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Importing…
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                <CheckCircle2 className="h-4 w-4" /> {result.created} row(s) imported successfully.
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 max-h-48 overflow-y-auto space-y-1">
                  {result.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-rose-700">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        <strong>Row {e.row}:</strong> {e.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
