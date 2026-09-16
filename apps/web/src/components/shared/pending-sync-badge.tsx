"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CloudUpload, RotateCw, AlertTriangle } from "lucide-react";
import { db } from "@/lib/offline/db";
import { discardQueuedMutation, retryQueuedMutation, kickSyncEngine } from "@/lib/offline/sync-engine";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

/** Shows how many locally-queued changes are waiting to sync; click to review/retry/discard failed ones. */
export function PendingSyncBadge({ className }: { className?: string }) {
  const items = useLiveQuery(
    () => db.queuedMutations.where("status").anyOf(["pending", "syncing", "failed"]).sortBy("createdAt"),
    [],
    []
  );

  const count = items?.length ?? 0;
  const failedCount = items?.filter((i) => i.status === "failed").length ?? 0;

  if (count === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={
            className ||
            "h-10 gap-1.5 rounded-full border-amber-600/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 font-mono text-xs font-bold"
          }
        >
          {failedCount > 0 ? <AlertTriangle className="h-4 w-4" /> : <CloudUpload className="h-4 w-4" />}
          {count} pending sync{count === 1 ? "" : "s"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-3 border-b flex items-center justify-between">
          <span className="text-sm font-semibold">Pending changes</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => kickSyncEngine()} className="h-7 gap-1 text-xs">
            <RotateCw className="h-3.5 w-3.5" /> Retry all
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y">
          {items?.map((item) => (
            <div key={item.id} className="p-3 text-sm space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.entity}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                </span>
              </div>
              <div className="text-xs text-muted-foreground capitalize">{item.status}</div>
              {item.status === "failed" && (
                <>
                  {item.lastError && (
                    <p className="text-xs text-red-600 break-words">{item.lastError}</p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => retryQueuedMutation(item.id!)}
                    >
                      Retry
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-red-600 hover:text-red-700"
                      onClick={() => discardQueuedMutation(item.id!)}
                    >
                      Discard
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
