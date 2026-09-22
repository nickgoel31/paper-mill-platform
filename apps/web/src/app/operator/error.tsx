"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Production strips the real message; the digest is the only thing that
    // ties this back to the matching stack trace in `wrangler tail`.
    console.error("[dashboard error]", error.digest || error.message, error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4 text-center">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900">Something went wrong loading this page</h2>
          <p className="text-xs text-slate-500">
            The error has been logged. If it keeps happening, share the reference code below.
          </p>
        </div>
        {error.digest && (
          <div className="text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-500">
            Reference: {error.digest}
          </div>
        )}
        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            onClick={() => reset()}
            className="h-9 px-4 rounded-xl bg-[#161622] hover:bg-[#202030] text-white text-xs font-bold gap-1.5 inline-flex items-center"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Try again
          </button>
          <Link
            href="/"
            className="h-9 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold gap-1.5 inline-flex items-center"
          >
            <Home className="h-3.5 w-3.5" /> Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
