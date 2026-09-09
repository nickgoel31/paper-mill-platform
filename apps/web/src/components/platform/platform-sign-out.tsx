"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function PlatformSignOut() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="h-8 px-3 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 flex items-center gap-1.5 transition-colors"
    >
      <LogOut className="h-3.5 w-3.5" /> Sign out
    </button>
  );
}
