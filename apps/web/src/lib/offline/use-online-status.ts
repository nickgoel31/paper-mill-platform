"use client";

import * as React from "react";

/**
 * Shared connectivity signal. `navigator.onLine` only reflects whether the
 * device has *a* network interface up, not whether our own server is
 * reachable, so it can read `true` on a captive/dead wifi. We treat it as a
 * fast-path hint (flips the UI + stops new attempts immediately on the
 * `offline` event) while the actual queue replay in sync-engine.ts still
 * verifies reachability with a real request before trusting `online`.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = React.useState(true);

  React.useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
