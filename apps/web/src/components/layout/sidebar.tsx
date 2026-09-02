"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Role } from "@prisma/client";
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
        {/* Left Active Cyan Line Indicator */}
        {isCurrentActive && (
          <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-sky-500 rounded-r-full" />
        )}

        {hasSubItems ? (
          <div>
            <button
              onClick={() => toggleSubMenu(item.href)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 group",
                isCurrentActive
                  ? "bg-sky-400 text-white font-semibold shadow-sm shadow-sky-200"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    isCurrentActive
                      ? "text-white"
                      : "text-slate-400 group-hover:text-slate-600"
                  )}
                />
                <span className="truncate">{item.title}</span>
              </div>

              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                  isCurrentActive ? "text-white/80" : "text-slate-400",
                  isSubOpen && "rotate-90"
                )}
              />
            </button>

            {/* Nested Sub-items with Branching Guide Line */}
            {isSubOpen && (
              <div className="ml-5 pl-3 mt-1 space-y-0.5 border-l border-slate-200">
                {item.subItems
                  ?.filter((sub) => sub.allowedRoles.includes(userRole))
                  .map((sub) => {
                    const isSubActive = pathname === sub.href;
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={cn(
                          "block px-2.5 py-1.5 text-xs rounded-lg transition-colors",
                          isSubActive
                            ? "font-bold text-sky-600 bg-sky-50/80"
                            : "text-slate-500 hover:text-slate-900 hover:bg-slate-50 font-normal"
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
              "flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 group",
              isCurrentActive
                ? "bg-sky-400 text-white font-semibold shadow-sm shadow-sky-200"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isCurrentActive
                    ? "text-white"
                    : "text-slate-400 group-hover:text-slate-600"
                )}
              />
              <span className="truncate">{item.title}</span>
            </div>

            {item.badge && (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-md font-mono",
                  isCurrentActive
                    ? "bg-white/20 text-white font-bold"
                    : "bg-slate-100 text-slate-500"
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
    <aside className="hidden md:flex w-60 border-r border-slate-100 bg-white flex-col shrink-0 h-screen sticky top-0 font-sans shadow-[1px_0_10px_rgba(0,0,0,0.02)]">
      {/* 1. BRAND HEADER */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-100/80">
        <div className="flex items-center gap-3">
          {/* Minimalist Logo Icon */}
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
            <Factory className="h-5 w-5 stroke-[2.2]" />
          </div>

          <div className="flex flex-col">
            <span className="font-extrabold text-[15px] tracking-tight text-slate-900 leading-none">
              HRA MILL
            </span>
            <span className="text-[11px] text-slate-400 font-medium leading-tight mt-1">
              Kraft ERP Suite
            </span>
          </div>
        </div>

        {/* Minimalist Badge */}
        <div className="h-5 w-5 rounded-md border border-slate-200 flex items-center justify-center text-[10px] text-slate-400 font-mono">
          α
        </div>
      </div>

      {/* 2. SCROLLABLE NAVIGATION */}
      <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-6 scrollbar-thin">
        {/* MAIN SECTION */}
        <div className="space-y-1">
          <div className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            MAIN
          </div>
          <div className="space-y-1">
            {mainItems.map(renderNavItem)}
          </div>
        </div>

        {/* OTHERS SECTION */}
        {othersItems.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-slate-100">
            <div className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              OTHERS
            </div>
            <div className="space-y-1">
              {othersItems.map(renderNavItem)}
            </div>
          </div>
        )}
      </div>

      {/* 3. USER PROFILE BOTTOM CARD WITH EMBEDDED LOGOUT */}
      <div className="p-3 border-t border-slate-100 bg-white">
        <div className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors group">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* User Avatar */}
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-amber-200 to-amber-100 border border-amber-300 flex items-center justify-center text-xs font-bold text-amber-900 shrink-0">
              {userName.charAt(0)}
            </div>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-slate-900 truncate">
                  {userName}
                </span>
                <CheckCircle2 className="h-3 w-3 text-sky-500 fill-sky-500/20 shrink-0" />
              </div>
              <span className="text-[11px] text-slate-400 truncate">
                {userEmail}
              </span>
            </div>
          </div>

          {/* 1-Click Logout Icon Button */}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Sign out of ERP"
            className="h-7 w-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-all shrink-0"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
