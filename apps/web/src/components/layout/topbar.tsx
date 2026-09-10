"use client";

import * as React from "react";
import Image from "next/image";
import { Role } from "@/generated/prisma/browser";
import { Search, Bell } from "lucide-react";
import { MobileSidebarDrawer } from "@/components/layout/mobile-nav/mobile-sidebar-drawer";

interface TopbarProps {
  userName: string;
  userEmail: string;
  userRole: Role;
}

export function Topbar({ userName, userEmail, userRole }: TopbarProps) {
  const [search, setSearch] = React.useState("");

  // Extract first name (e.g. "Josie", "Ramesh", "Nick")
  const firstName = userName ? userName.split(" ")[0] : "Josie";

  return (
    <header className="w-full px-3 sm:px-6 pt-3 sm:pt-4 pb-1 select-none">
      <div className="flex items-center justify-between gap-4 bg-white rounded-[24px] sm:rounded-[28px] px-5 sm:px-8 py-3 sm:py-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100">
        {/* Left Side: Mobile Menu + Greeting */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="md:hidden">
            <MobileSidebarDrawer
              userRole={userRole}
              userName={userName}
              userEmail={userEmail}
            />
          </div>

          <div className="flex items-baseline gap-1 text-slate-800 tracking-tight text-base sm:text-lg">
            <span className="font-normal text-slate-600">Welcome back,</span>
            <span className="font-bold text-slate-900">{firstName}!</span>
          </div>
        </div>

        {/* Right Side: Search Pill, Bell Notification, and User Avatar */}
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          {/* Search Pill Input */}
          <div className="relative flex items-center">
            <div className="flex items-center gap-2.5 h-11 px-4 rounded-2xl bg-slate-100/70 border border-transparent focus-within:border-slate-300 focus-within:bg-white transition-all w-36 sm:w-64 md:w-72">
              <Search className="w-4 h-4 text-slate-500 shrink-0 stroke-[2]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search...."
                className="w-full bg-transparent border-none outline-none text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 font-normal"
              />
            </div>
          </div>

          {/* Bell Notification Button */}
          <button
            type="button"
            className="h-11 w-11 rounded-2xl bg-slate-100/70 hover:bg-slate-200/60 border border-transparent flex items-center justify-center text-slate-600 transition-colors relative"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4 stroke-[2]" />
          </button>

          {/* User Profile Avatar Pill */}
          <div className="relative shrink-0">
            <div className="h-11 w-11 rounded-2xl overflow-hidden bg-slate-200 border border-slate-200/80 shadow-xs flex items-center justify-center">
              {/* Default Avatar Photo matching the mockup persona */}
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&h=160&q=80"
                alt={userName}
                className="h-full w-full object-cover"
                onError={(e) => {
                  // Fallback to initials if network image fails
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
              <span className="text-xs font-bold text-slate-700 select-none">
                {firstName.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
