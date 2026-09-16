"use client";

import { WifiOff } from "lucide-react";

interface OfflineEmptyStateProps {
  label?: string;
}

/** Shown when a screen is opened offline and nothing was ever cached for it locally. */
export function OfflineEmptyState({
  label = "This data hasn't been loaded on this device yet.",
}: OfflineEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
      <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
        <WifiOff className="h-7 w-7" />
      </div>
      <div className="space-y-1 max-w-sm">
        <p className="font-semibold text-foreground">You&apos;re offline</p>
        <p className="text-sm">{label} Reconnect to the internet to view it.</p>
      </div>
    </div>
  );
}
