import { Role } from "@/generated/prisma/browser";
import { Badge } from "@/components/ui/badge";
import { TutorialModal } from "@/components/layout/tutorial-modal";
import { MobileSidebarDrawer } from "@/components/layout/mobile-nav/mobile-sidebar-drawer";

interface TopbarProps {
  userName: string;
  userEmail: string;
  userRole: Role;
}

function getRoleBadgeVariant(role: Role) {
  switch (role) {
    case Role.ADMIN:
      return "bg-purple-100 text-purple-900 border-purple-300";
    case Role.PLANNER:
      return "bg-blue-100 text-blue-900 border-blue-300";
    case Role.OPERATOR:
      return "bg-amber-100 text-amber-900 border-amber-300";
    case Role.SALES:
      return "bg-emerald-100 text-emerald-900 border-emerald-300";
    case Role.DISPATCH:
      return "bg-sky-100 text-sky-900 border-sky-300";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function Topbar({ userName, userEmail, userRole }: TopbarProps) {
  return (
    <header className="h-14 border-b bg-card/90 backdrop-blur px-3 sm:px-6 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Mobile Hamburger Drawer Trigger */}
        <MobileSidebarDrawer
          userRole={userRole}
          userName={userName}
          userEmail={userEmail}
        />

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-900 tracking-tight block sm:hidden">
            HRA Mill
          </span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:inline-block">
            Production Environment
          </span>
          <span className="text-muted-foreground/40 hidden sm:inline-block">•</span>
          <span className="text-xs font-mono text-muted-foreground hidden sm:inline-block">
            Single Mill / India
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-2">
          <div className="flex flex-col text-right">
            <span className="text-xs sm:text-sm font-semibold text-foreground leading-tight truncate max-w-[110px] sm:max-w-[200px]">
              {userName}
            </span>
            <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight hidden sm:inline-block">
              {userEmail}
            </span>
          </div>

          <span
            className={`text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 rounded-full font-bold border ${getRoleBadgeVariant(
              userRole
            )}`}
          >
            {userRole}
          </span>
        </div>

        <div className="h-4 w-px bg-border hidden sm:block" />

        <div className="hidden sm:block">
          <TutorialModal />
        </div>
      </div>
    </header>
  );
}

