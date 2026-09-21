"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { enterMill, exitMill } from "@/server/services/platform-service";
import { Eye, LogOut } from "lucide-react";

interface ViewAsBannerProps {
  currentMillId: string;
  mills: { id: string; name: string; code: string; postProductionMode: string }[];
}

const MODE_LABEL: Record<string, string> = {
  AUTO_DISPATCH: "Auto-allocate to orders",
  INVENTORY: "Store in inventory",
};

/** Sticky strip shown while platform staff are inside a mill's ERP. */
export function ViewAsBanner({ currentMillId, mills }: ViewAsBannerProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const current = mills.find((m) => m.id === currentMillId);

  async function switchTo(id: string) {
    if (id === currentMillId) return;
    setBusy(true);
    try {
      await enterMill(id);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Could not switch mill");
    } finally {
      setBusy(false);
    }
  }

  async function exit() {
    setBusy(true);
    try {
      await exitMill();
      router.push("/platform");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Could not exit");
      setBusy(false);
    }
  }

  return (
    <div className="w-full bg-amber-400 text-slate-900 px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold select-none">
      <span className="inline-flex items-center gap-1.5">
        <Eye className="h-4 w-4" />
        Viewing as mill admin
      </span>
      <select
        value={currentMillId}
        disabled={busy}
        onChange={(e) => switchTo(e.target.value)}
        className="h-7 rounded-md border border-amber-600/40 bg-amber-50 px-2 text-xs font-bold"
        aria-label="Switch mill"
      >
        {mills.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} ({m.code})
          </option>
        ))}
      </select>
      {current && (
        <span className="opacity-80">
          Post-production: {MODE_LABEL[current.postProductionMode] ?? current.postProductionMode}
        </span>
      )}
      <button
        type="button"
        onClick={exit}
        disabled={busy}
        className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-slate-900 text-white px-3 h-7 hover:bg-slate-800 disabled:opacity-60"
      >
        <LogOut className="h-3.5 w-3.5" /> Exit to platform
      </button>
    </div>
  );
}
