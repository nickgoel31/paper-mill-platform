"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Role } from "@/generated/prisma/browser";
import { navConfig, NavItem } from "@/config/nav";
import { cn } from "@/lib/utils";
import {
  Menu,
  X,
  Factory,
  CheckCircle2,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface MobileSidebarDrawerProps {
  userRole: Role;
  userName?: string;
  userEmail?: string;
}

export function MobileSidebarDrawer({
  userRole,
  userName = "Factory Staff",
  userEmail = "",
}: MobileSidebarDrawerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const pathname = usePathname();

  // Close drawer automatically on route change
  React.useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

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
          (hasSubItems && item.subItems?.some((sub) => pathname.startsWith(sub.href))) ||
          (!hasSubItems && pathname.startsWith(item.href));

    return (
      <div key={item.href} className="relative select-none">
        {hasSubItems ? (
          <div>
            <button
              type="button"
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
                    isCurrentActive ? "text-[#11111a]" : "text-slate-400 group-hover:text-slate-200"
                  )}
                />
                <span className="truncate tracking-tight">{item.title}</span>
              </div>

              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-200",
                  isCurrentActive ? "text-[#11111a]" : "text-slate-500 group-hover:text-slate-300",
                  isSubOpen && "rotate-90"
                )}
              />
            </button>

            {isSubOpen && (
              <div className="pl-9 pr-2 py-1 space-y-1 mt-1 border-l border-white/10 ml-5">
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
                  isCurrentActive ? "text-[#11111a]" : "text-slate-400 group-hover:text-slate-200"
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

  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      {/* Mobile Hamburger Trigger Button (Visible only on md:hidden) */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="md:hidden h-9 w-9 flex items-center justify-center rounded-xl bg-slate-900 text-[#d4f842] hover:bg-slate-800 transition-colors"
        aria-label="Open Mobile Menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Render Slide-over Drawer in body portal to avoid header overflow/clipping */}
      {mounted &&
        createPortal(
          <>
            {/* Backdrop Overlay */}
            {isOpen && (
              <div
                className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[100] transition-opacity md:hidden"
                onClick={() => setIsOpen(false)}
              />
            )}

            {/* Slide-over Drawer Panel */}
            <aside
              className={cn(
                "fixed inset-y-0 left-0 w-[290px] bg-[#161622] text-slate-300 z-[101] shadow-2xl flex flex-col transition-transform duration-300 ease-out md:hidden font-sans border-r border-white/[0.08]",
                isOpen ? "translate-x-0" : "-translate-x-full"
              )}
            >
              {/* Drawer Header */}
              <div className="h-16 px-4 flex items-center justify-between border-b border-white/[0.06] shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-[#d4f842] flex items-center justify-center text-[#11111a] font-black shadow-[0_0_15px_rgba(212,248,66,0.35)] shrink-0">
                    <span className="text-xl leading-none font-black font-mono">@</span>
                  </div>

                  <div className="flex flex-col">
                    <span className="font-extrabold text-[16px] tracking-tight text-white leading-none flex items-center gap-1">
                      <span className="text-[#d4f842]">hra</span>
                      <span>mill</span>
                    </span>
                    <span className="text-[9px] font-bold text-[#d4f842]/70 uppercase tracking-widest leading-tight mt-1">
                      KRAFT ERP SUITE
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Scrollable Navigation */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 sidebar-scrollbar">
                <div className="space-y-1">
                  <div className="px-3 pb-1.5 text-[11px] font-medium text-slate-400">
                    Overview
                  </div>
                  <div className="space-y-1.5">{mainItems.map(renderNavItem)}</div>
                </div>

                {othersItems.length > 0 && (
                  <div className="space-y-1 pt-3 border-t border-white/[0.06]">
                    <div className="px-3 pb-1.5 text-[11px] font-medium text-slate-400">
                      Other
                    </div>
                    <div className="space-y-1.5">{othersItems.map(renderNavItem)}</div>
                  </div>
                )}
              </div>

              {/* User Footer */}
              <div className="p-3.5 space-y-3 shrink-0 bg-[#161622] border-t border-white/[0.06]">
                {/* User Bar */}
                <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.04] border border-white/[0.05]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-[#d4f842] to-lime-200 text-[#11111a] flex items-center justify-center text-[11px] font-black shrink-0">
                      {userName.charAt(0)}
                    </div>

                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-white truncate max-w-[120px]">
                        {userName}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                        {userRole}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    title="Sign out"
                    className="h-7 w-7 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition-all shrink-0"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </aside>
          </>,
          document.body
        )}
    </>
  );
}
