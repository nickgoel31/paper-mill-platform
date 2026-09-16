"use client";

import * as React from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/lib/offline/use-online-status";
import { PendingSyncBadge } from "@/components/shared/pending-sync-badge";
import {
  Factory,
  Wifi,
  WifiOff,
  LogOut,
  ChevronLeft,
} from "lucide-react";

interface OperatorHeaderProps {
  machineName?: string;
  machineCode?: string;
  backHref?: string;
  backLabel?: string;
}

export function OperatorHeader({
  machineName,
  machineCode,
  backHref,
  backLabel,
}: OperatorHeaderProps) {
  const isOnline = useOnlineStatus();

  return (
    <header className="sticky top-0 z-30 bg-slate-950 text-white border-b-2 border-slate-800 shadow-md select-none">
      {/* Flaky Connection Offline Banner */}
      {!isOnline && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-center text-sm font-black flex items-center justify-center gap-2 animate-pulse">
          <WifiOff className="h-5 w-5" />
          OFFLINE MODE: Network connection lost. Changes will be synchronized when reconnected.
        </div>
      )}

      <div className="px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
        {/* Left Side: Back / Logo */}
        <div className="flex items-center gap-3">
          {backHref && (
            <Button
              asChild
              variant="outline"
              className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-slate-900 border-2 border-slate-700 text-white hover:bg-slate-800 p-0 flex items-center justify-center shadow"
            >
              <Link href={backHref} title={backLabel || "Back"}>
                <ChevronLeft className="h-8 w-8" />
              </Link>
            </Button>
          )}

          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-amber-400 text-slate-950 font-black flex items-center justify-center text-xl shadow">
              <Factory className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <div>
              <div className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                HRA PAPER MILL
                <span className="text-[10px] sm:text-xs font-mono font-bold bg-slate-800 text-amber-300 px-2 py-0.5 rounded border border-slate-700">
                  OPERATOR
                </span>
              </div>
              {machineName && (
                <div className="text-xs sm:text-sm font-bold font-mono text-slate-400">
                  {machineName} ({machineCode})
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Network Status & Sign Out */}
        <div className="flex items-center gap-3">
          <PendingSyncBadge className="h-10 gap-1.5 rounded-full border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 font-mono text-xs font-bold" />

          <div className="hidden sm:flex items-center gap-1.5 font-mono text-xs font-bold text-slate-400 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
            {isOnline ? (
              <>
                <Wifi className="h-4 w-4 text-emerald-400" />
                <span className="text-emerald-400">ONLINE</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-amber-400" />
                <span className="text-amber-400">OFFLINE</span>
              </>
            )}
          </div>

          <Button
            type="button"
            variant="ghost"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="h-12 px-3 sm:px-4 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 font-bold text-xs sm:text-sm gap-2"
          >
            <LogOut className="h-5 w-5" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
