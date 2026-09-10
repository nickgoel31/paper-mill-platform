"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Role } from "@/generated/prisma/browser";
import { navConfig, NavItem } from "@/config/nav";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  Factory,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  Settings as SettingsIcon,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  userRole: Role;
  userName?: string;
  userEmail?: string;
}

export function Sidebar({
  userRole,
  userName = "Ramesh Patel",
  userEmail = "admin@papermill.local",
}: SidebarProps) {
  const pathname = usePathname();

  // Track expanded dropdown sub-menus
  const [openSubMenus, setOpenSubMenus] = React.useState<Record<string, boolean>>({
    "/dispatch": pathname.startsWith("/dispatch") || pathname.startsWith("/loads"),
    "/masters/clients": pathname.startsWith("/masters"),
  });

  const toggleSubMenu = (href: string) => {
    setOpenSubMenus((prev) => ({
      ...prev,
      [href]: !prev[href],
    }));
  };

  // Filter nav items by user role
  const visibleNavItems = navConfig.filter((item) =>
    item.allowedRoles.includes(userRole)
  );

  const mainItems = visibleNavItems.filter((i) => i.section === "main" || !i.section);
  const othersItems = visibleNavItems.filter((i) => i.section === "settings");

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const hasSubItems = Boolean(item.subItems && item.subItems.length > 0);
    const isSubOpen = Boolean(openSubMenus[item.href]);

    const isCurrentActive =
      item.href === "/"
        ? pathname === "/"
        : pathname === item.href ||
          (hasSubItems &&
            item.subItems?.some((sub) => pathname.startsWith(sub.href))) ||
          (!hasSubItems && pathname.startsWith(item.href));

    return (
      <div key={item.href} className="relative select-none">
        {hasSubItems ? (
          <div>
            <button
              onClick={() => toggleSubMenu(item.href)}
              className={cn(
                "w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-[13px] font-semibold transition-all duration-150 group",
                isCurrentActive
                  ? "bg-[#d4f842] text-[#11111a] font-bold shadow-md shadow-[#d4f842]/20"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.05]"
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors stroke-[2.2]",
                    isCurrentActive
                      ? "text-[#11111a]"
                      : "text-slate-400 group-hover:text-slate-200"
                  )}
                />
                <span className="truncate tracking-tight">{item.title}</span>
              </div>

              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                  isCurrentActive ? "text-[#11111a]" : "text-slate-500 group-hover:text-slate-300",
                  isSubOpen && "rotate-90"
                )}
              />
            </button>

            {/* Nested Sub-items with Branching Guide Line */}
            {isSubOpen && (
              <div className="ml-5 pl-3.5 mt-1 space-y-1 border-l border-white/10">
                {item.subItems
                  ?.filter((sub) => sub.allowedRoles.includes(userRole))
                  .map((sub) => {
                    const isSubActive = pathname === sub.href;
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={cn(
                          "block px-2.5 py-1.5 text-xs rounded-xl transition-colors",
                          isSubActive
                            ? "font-bold text-[#d4f842] bg-white/[0.06]"
                            : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
                        )}
                      >
                        {sub.title}
                      </Link>
                    );
                  })}
              </div>
            )}
          </div>
        ) : (
          <Link
            href={item.href}
            className={cn(
              "flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-[13px] font-semibold transition-all duration-150 group",
              isCurrentActive
                ? "bg-[#d4f842] text-[#11111a] font-bold shadow-md shadow-[#d4f842]/20"
                : "text-slate-400 hover:text-white hover:bg-white/[0.05]"
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors stroke-[2.2]",
                  isCurrentActive
                    ? "text-[#11111a]"
                    : "text-slate-400 group-hover:text-slate-200"
                )}
              />
              <span className="truncate tracking-tight">{item.title}</span>
            </div>

            {item.badge && (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold",
                  isCurrentActive
                    ? "bg-[#11111a]/20 text-[#11111a]"
                    : "bg-white/10 text-slate-300"
                )}
              >
                {item.badge}
              </span>
            )}
          </Link>
        )}
      </div>
    );
  };

  return (
    <aside className="hidden md:flex flex-col shrink-0 w-80 h-screen sticky top-0 p-3 select-none font-sans z-30">
      {/* Floating Dark Pill Container */}
      <div className="flex-1 flex flex-col bg-[#161622] text-slate-300 rounded-[28px] shadow-2xl border border-white/[0.06] overflow-hidden">
        {/* 1. BRAND HEADER */}
        <div className="pt-6 pb-4 px-6 flex items-center justify-between shrink-0">
          <Link href="/" className="flex items-center gap-2.5 group">
            {/* Custom Neon Spiral/Geometric Logo Icon */}
            <div className="h-9 w-9 rounded-xl bg-[#d4f842] flex items-center justify-center text-[#11111a] font-black shadow-[0_0_15px_rgba(212,248,66,0.35)] transition-transform group-hover:scale-105">
              <span className="text-xl leading-none font-black font-mono">@</span>
            </div>

            <div className="flex flex-col">
              <span className="font-extrabold text-[17px] tracking-tight text-white leading-none flex items-center gap-1">
                <span className="text-[#d4f842]">hra</span>
                <span>mill</span>
              </span>
              <span className="text-[9px] font-bold text-[#d4f842]/70 uppercase tracking-widest leading-tight mt-1">
                KRAFT ERP SUITE
              </span>
            </div>
          </Link>

          {/* Minimalist Pill Badge */}
          <div className="px-1.5 py-0.5 rounded-full border border-white/10 bg-white/5 text-[9px] text-slate-400 font-mono">
            v2.4
          </div>
        </div>

        {/* 2. SCROLLABLE NAVIGATION */}
        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-5 sidebar-scrollbar">
          {/* MAIN / OVERVIEW SECTION */}
          <div className="space-y-1">
            <div className="px-3 pb-1.5 text-[11px] font-medium text-slate-400">
              Overview
            </div>
            <div className="space-y-1.5">
              {mainItems.map(renderNavItem)}
            </div>
          </div>

          {/* OTHERS SECTION */}
          {othersItems.length > 0 && (
            <div className="space-y-1 pt-3 border-t border-white/[0.06]">
              <div className="px-3 pb-1.5 text-[11px] font-medium text-slate-400">
                Other
              </div>
              <div className="space-y-1.5">
                {othersItems.map(renderNavItem)}
              </div>
            </div>
          )}
        </div>

        {/* 3. BOTTOM USER PROFILE */}
        <div className="p-3.5 space-y-3 shrink-0 bg-[#161622] border-t border-white/[0.06]">
          {/* User Account Bar with Logout */}
          <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.05]">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-[#d4f842] to-lime-200 text-[#11111a] flex items-center justify-center text-[11px] font-black shrink-0">
                {userName.charAt(0)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-white truncate leading-tight">
                  {userName}
                </span>
                <span className="text-[10px] text-slate-400 truncate leading-tight">
                  {userRole}
                </span>
              </div>
            </div>

            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Sign out of ERP"
              className="h-7 w-7 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition-colors shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
