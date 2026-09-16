"use client";

import * as React from "react";
import { initSyncEngine } from "@/lib/offline/sync-engine";
// Imported for its side effect: registers every offline-aware write action
// with the sync engine on first paint of ANY route, so a mutation queued on
// one screen can still be replayed after a reload that lands on another.
import "@/lib/offline/wrapped-actions";

/** Mounted once from the root layout. Registers the service worker (production only) and starts the offline sync engine. */
export function OfflineBootstrap() {
  React.useEffect(() => {
    initSyncEngine();

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal: app still works online, just without the offline app-shell fallback.
      });
    }
  }, []);

  return null;
}
